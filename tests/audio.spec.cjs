const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function writeWav(filename, samples, rate) {
    const buffer = Buffer.alloc(44 + samples.length * 2);
    buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((value, i) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
    fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, buffer);
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage(); const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname, '../paper_shredder_academic_decompression_simulator.html')).href);
        await page.evaluate(() => { gameLoop = () => {}; sfx.setMuted(true); });
        const results = {};
        for (const name of ['gatling', 'laser', 'hammer', 'blackHole', 'rewind', 'sword', 'muted']) {
            const result = await page.evaluate(async name => {
                const rate = 24000, context = new OfflineAudioContext(1, rate * 2, rate), fx = new SoundEffects(context);
                if (name === 'gatling') fx.playGatling();
                if (name === 'hammer') fx.playHammerSlam();
                if (name === 'rewind') fx.playRewind();
                if (name === 'sword') fx.playSword(true);
                if (name === 'muted') { fx.setMuted(true); fx.playGatling(); fx.playHammerSlam(); }
                if (name === 'laser' || name === 'blackHole') {
                    for (let i = 0; i < 30; i++) fx.sync(name === 'laser', name === 'blackHole' ? 1 : 0);
                    if (fx.loops.size !== 1) throw Error('Loop synchronization must reuse active voices');
                    context.suspend(1).then(() => { fx.stopLoops(); context.resume(); });
                }
                const audio = await context.startRendering(), samples = audio.getChannelData(0);
                const rms = (from, to) => {
                    let energy = 0; for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i++) energy += samples[i] ** 2;
                    return Math.sqrt(energy / ((to - from) * rate));
                };
                let peak = 0, low = 0, lowEnergy = 0, energy = 0;
                const coefficient = 1 - Math.exp(-2 * Math.PI * 150 / rate);
                for (const sample of samples) {
                    peak = Math.max(peak, Math.abs(sample)); low += coefficient * (sample - low);
                    lowEnergy += low ** 2; energy += sample ** 2;
                }
                return { samples: Array.from(samples), peak, rms: rms(0, 1.5), early: rms(.03, .12), sustained: rms(.3, .8), tail: rms(1.25, 1.9), lowRatio: lowEnergy / (energy || 1), loops: fx.loops.size };
            }, name);
            writeWav(path.join(__dirname, '.tmp', `sound-${name}.wav`), result.samples, 24000);
            delete result.samples; results[name] = result;
        }
        console.log(JSON.stringify(results));
        for (const name of ['gatling', 'laser', 'hammer', 'blackHole']) {
            assert(results[name].rms > .002, `${name} must produce audible energy`);
            assert(results[name].peak < .99, `${name} must stay below clipping`);
        }
        assert(results.gatling.early > results.gatling.sustained * 100, 'gunshot has a hard mechanical transient');
        assert(results.hammer.sustained > results.gatling.sustained + .001, 'hammer retains a fracture/debris tail');
        assert(results.laser.sustained > .01 && results.laser.tail < .0001, 'laser sustains then stops cleanly');
        assert(results.blackHole.lowRatio > .75, 'black hole sound is dominated by low frequencies');
        assert(results.blackHole.sustained > .02 && results.blackHole.tail < results.blackHole.sustained*.15);
        assert(results.rewind.sustained>results.rewind.early && results.sword.rms>.002);
        assert(results.laser.loops === 0 && results.blackHole.loops === 0);
        assert.equal(results.muted.rms, 0);
        await page.evaluate(() => {
            sfx.setMuted(false); selectWeapon(2); beginAttack(); renderScene();
            if (!sfx.loops.has('laser')) throw Error('Holding laser should start its sustained sound');
            releaseAttack(); if (sfx.loops.has('laser')) throw Error('Releasing laser should stop its sound');
            sfx.sync(false, 1); sfx.setMuted(true);
            if (sfx.loops.size) throw Error('Mute must stop all ongoing loops');
        });
        assert.deepEqual(errors, []);
        console.log('PASS: four distinct layered sounds + sustained laser + low-frequency black-hole drone + fracture tail + no clipping + mute/release + bounded loop voices');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
