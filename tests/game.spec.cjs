const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Advance simulation explicitly so hit-stop, charge duration and damage are deterministic.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../paper_shredder_academic_decompression_simulator.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const run = callback => page.evaluate(callback);
    assert.equal(await page.locator('#pageIndicator').innerText(), '01 / 03');
    assert(await page.locator('#prevPageBtn').isDisabled());
    const initial = await run(() => {
        damageWordBody(wordBodies[25], 0, 0, true);
        scorchLaserLine(paperRect.x + 30, paperRect.y + 100, paperRect.x + 500, paperRect.y + 100);
        return { state: wordBodies[25].state, alpha: damageCtx.getImageData(200, 100, 1, 1).data[3], title: getPageTemplate().title };
    });
    await page.locator('#nextPageBtn').click();
    assert.equal(await page.locator('#pageIndicator').innerText(), '02 / 03');
    assert.notEqual(await run(() => getPageTemplate().title), initial.title);
    assert.equal(await run(() => wordBodies.filter(w => w.state !== 'formatted').length), 0);
    await page.locator('#prevPageBtn').click();
    const restored = await run(() => ({ state: wordBodies[25].state, alpha: damageCtx.getImageData(200, 100, 1, 1).data[3] }));
    assert.equal(restored.state, initial.state);
    assert(restored.alpha > 0 && restored.alpha <= initial.alpha, 'page residue may age while away');
    await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
    assert(await page.locator('#nextPageBtn').isDisabled());
    await page.keyboard.press('PageUp'); await page.keyboard.press('PageUp');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(100);
    assert.equal(await run(() => wordBodies[25].state), 'obliterated');
    assert(await run(() => wordBodies.every(w => w.origY + w.h < paperRect.y + paperRect.h)));

    const laser = await run(() => {
        clearTransientEffects(); damageCtx.clearRect(0, 0, damageCanvas.width, damageCanvas.height);
        scorchLaserLine(paperRect.x + 40, paperRect.y + 120, paperRect.x + 600, paperRect.y + 120);
        const ink = (x, y) => damageCtx.getImageData(x, y, 1, 1).data[3];
        return { continuous: Array.from({ length: 550 }, (_, i) => ink(45 + i, 120)).every(a => a > 150), narrow: ink(300, 125) === 0 };
    });
    assert(laser.continuous && laser.narrow, 'laser must leave a continuous narrow incision');
    const fading = await run(() => {
        clearTransientEffects();
        damageCtx.clearRect(0, 0, damageCanvas.width, damageCanvas.height);
        scorchPaperAt(paperRect.x + 80, paperRect.y + 200, 18);
        scorchPaperAt(paperRect.x + 200, paperRect.y + 200, 40, true);
        slamHammer(paperRect.x + 400, paperRect.y + 200, .5);
        scorchLaserLine(paperRect.x + 40, paperRect.y + 120, paperRect.x + 600, paperRect.y + 120);
        const samples = () => [[80, 200], [200, 200], [400, 200], [200, 120]].map(([x, y]) => damageCtx.getImageData(x, y, 1, 1).data[3]);
        const start = samples();
        for (let i = 0; i < 60; i++) updateSimulation(1 / 60);
        const afterSecond = samples();
        for (let i = 0; i < 190; i++) updateSimulation(1 / 60);
        return { start, afterSecond, expired: samples(), retained: [[80,200],[200,200],[400,200],[200,120]].map(([x,y]) => residueCtx.getImageData(x,y,1,1).data[3]) };
    });
    assert(fading.start.every(a => a > 0));
    assert(fading.afterSecond.every((a, i) => a > 0 && a < fading.start[i] * .8), 'deep residues should fade gradually');
    assert(fading.expired.every(a => a === 0), 'the fresh dark layer should finish fading');
    assert(fading.retained.every(a => a > 0), 'all weapon traces must retain a faint permanent layer');
    const awayFade = await run(() => {
        scorchPaperAt(paperRect.x + 80, paperRect.y + 200, 18);
        changePage(1);
        pageStates.get('neurips:0').savedAt -= 5000;
        changePage(-1);
        return { alpha: damageCtx.getImageData(80, 200, 1, 1).data[3], residue: residueCtx.getImageData(80,200,1,1).data[3], state: wordBodies[25].state };
    });
    assert.equal(awayFade.alpha, 0, 'expired residue must not reappear when returning to a page');
    assert(awayFade.residue > 0, 'faint residue must survive page changes');
    assert.equal(awayFade.state, 'obliterated', 'visual residue expiry must not restore destroyed words');

    await page.mouse.move(1100, 300);
    await page.keyboard.down('a');
    assert.equal(await run(() => { stickman.update(1 / 60); return stickman.facing; }), 1, 'movement must not override aim-facing');
    assert(await run(() => Math.cos(stickman.aimAngle) > 0), 'weapon continues to follow the cursor');
    await page.keyboard.up('a'); await page.keyboard.down('d');
    await page.mouse.move(180, 300);
    assert.equal(await run(() => { stickman.update(1 / 60); return stickman.facing; }), -1, 'aim left must face left even while moving right');
    await page.keyboard.up('d');
    assert.equal(await run(() => { stickman.update(1 / 60); return stickman.facing; }), -1, 'idle follows aim');
    await run(() => {
        toggleFlight(); keys.a = true; stickman.update(1 / 60); keys.a = false;
        if (stickman.facing !== -1) throw Error('flight should also follow aim');
        toggleFlight(); renderScene(); clearTransientEffects(); layoutAcademicPaper();
    });
    const shake = await run(() => {
        let max = 0; clearTransientEffects();
        for (let i = 0; i < 200; i++) {
            addScreenShake(1, -1, 36); updateSimulation(1 / 60);
            max = Math.max(max, Math.abs(screenShake.x), Math.abs(screenShake.y));
        }
        clearTransientEffects(); return max;
    });
    assert(shake > 0 && shake <= 2, 'even repeated impacts stay within two CSS pixels per axis');
    const camera = await run(() => {
        const sample = (start, steps) => {
            clearTransientEffects(); start();
            let peak = 0, reversed = false;
            for (const dt of steps) {
                updateScreenShake(dt);
                peak = Math.max(peak, Math.abs(screenShake.x), Math.abs(screenShake.y));
                if (screenShake.x > .00001) reversed = true;
            }
            return { peak, reversed, tail: Math.hypot(screenShake.x, screenShake.y) };
        };
        const sword = [20, 30, 60, 120].map(fps => sample(() => {
            selectWeapon(4); stickman.aimAngle = 0; fireWeapon(.016, 0);
        }, Array(fps).fill(1 / fps)));
        const uneven = sample(() => {
            selectWeapon(4); stickman.aimAngle = 0; fireWeapon(.016, 1);
        }, Array.from({ length: 60 }, (_, i) => i % 2 ? .05 : 1 / 120));
        const hammer = [0, .9, 1].map(power => sample(() => {
            slamHammer(paperRect.x + 200, paperRect.y + 200, power);
        }, Array(60).fill(1 / 60)).peak);
        const blackHole = [0, .9, 1].map(power => sample(() => {
            selectWeapon(1); stickman.aimAngle = 0; fireWeapon(.016, power);
            blackHoles[0].life = 0;
            const random = Math.random;
            try { Math.random = () => .9; updateSimulation(1 / 60); }
            finally { Math.random = random; }
        }, Array(60).fill(1 / 60)).peak);
        const sustained = [0, 2].map(weapon => {
            clearTransientEffects(); selectWeapon(weapon); stickman.aimAngle = 0;
            let peak = 0;
            for (let i = 0; i < 240; i++) {
                stickman.fireCooldown = Math.max(0, stickman.fireCooldown - 1 / 120);
                fireWeapon(1 / 120); updateScreenShake(1 / 120);
                peak = Math.max(peak, Math.abs(screenShake.x), Math.abs(screenShake.y));
            }
            return peak;
        });
        clearTransientEffects();
        return { sword, uneven, hammer, blackHole, sustained };
    });
    assert(camera.sword.every(s => s.peak > 0 && s.peak < .15 && !s.reversed && s.tail < .001), 'sword taps settle gently without oscillation at 20–120 FPS');
    assert(Math.max(...camera.sword.map(s => s.peak)) - Math.min(...camera.sword.map(s => s.peak)) < .02, 'frame rate must not amplify sword shake');
    assert(camera.uneven.peak < .15 && !camera.uneven.reversed && camera.uneven.tail < .001, 'charged sword also remains stable through uneven frame times');
    for (const impacts of [camera.hammer, camera.blackHole]) {
        assert(impacts[0] < .25 && impacts[1] < .25, 'uncharged and ordinary-range impacts stay subtle');
        assert(impacts[2] > 1 && impacts[2] <= 2, 'maximum-range charged impacts have a controlled stronger shake');
    }
    assert(camera.sustained.every(peak => peak < .7), 'continuous gunfire and laser cannot accumulate excessive camera movement');
    console.log('Camera regression:', JSON.stringify(camera));
    const recoil = await run(() => [0, 1, 2, 3].map(weapon => {
        clearTransientEffects(); selectWeapon(weapon); stickman.vx = 0; stickman.vy = 0; stickman.aimAngle = 0;
        fireWeapon(.016, 1);
        return { offset: stickman.recoilOffset, vx: stickman.vx };
    }));
    assert.deepEqual(recoil.map(r => r.offset), [7.2, 20, 4, 12]);
    assert(recoil.every(r => Math.abs(r.vx) > 0));

    for (const weapon of [1, 3]) {
        await page.locator(`[data-weapon="${weapon}"]`).click();
        const compared = await page.evaluate(weapon => {
            const result = [];
            for (const power of [0, 1]) {
                clearTransientEffects(); selectWeapon(weapon); stickman.aimAngle = 0; fireWeapon(.016, power);
                const projectile = weapon === 1 ? blackHoles[0] : hammerWaves[0];
                result.push({ range: projectile.remaining ?? projectile.range, radius: projectile.blastRadius ?? 100 + power * 160 });
            }
            return result;
        }, weapon);
        assert(compared[1].range > compared[0].range * 3);
        assert(compared[1].radius > compared[0].radius);
        await run(() => { clearTransientEffects(); stickman.resetPosition(); });
        await page.mouse.move(700, 420); await page.mouse.down();
        assert.equal(await run(() => charge.active), true);
        await run(() => { for (let i = 0; i < 120; i++) updateSimulation(1 / 60); });
        assert.equal(await run(() => blackHoles.length + hammerWaves.length), 0, 'holding must not fire early');
        assert.equal(await run(() => charge.elapsed), 1.8);
        await page.mouse.up();
        assert.equal(await run(() => blackHoles.length + hammerWaves.length), 1, 'release fires once');
        await run(() => { for (let i = 0; i < 250; i++) updateSimulation(1 / 60); renderScene(); });
        assert.equal(await run(() => blackHoles.length + hammerWaves.length), 0);
    }
    const damage = await run(() => {
        const results = [];
        for (const power of [0, 1]) {
            clearTransientEffects();
            wordBodies = Array.from({ length: 40 }, (_, i) => ({ x: 500 + i * 6, y: 400, w: 4, h: 5, state: 'formatted', type: 'word' }));
            slamHammer(500, 400, power);
            results.push({ affected: wordBodies.filter(w => w.state !== 'formatted').length, destroyed: wordBodies.filter(w => w.state === 'obliterated').length });
        }
        return results;
    });
    assert(damage[1].affected > damage[0].affected && damage[1].destroyed > damage[0].destroyed);
    const singularityDamage = await run(() => {
        const results = [];
        for (const power of [0, 1]) {
            clearTransientEffects(); selectWeapon(1); stickman.aimAngle = 0; fireWeapon(.016, power);
            Object.assign(blackHoles[0], { x: 500, y: 400, remaining: 0, life: 0 });
            wordBodies = Array.from({ length: 50 }, (_, i) => ({ x: 500 + i * 7, y: 400, w: 4, h: 5, vx: 0, vy: 0, vAngle: 0, angle: 0, state: 'formatted', type: 'word' }));
            updateSimulation(1 / 60);
            results.push({ affected: wordBodies.filter(w => w.state !== 'formatted').length, destroyed: wordBodies.filter(w => w.state === 'obliterated').length });
        }
        return results;
    });
    assert(singularityDamage[1].affected > singularityDamage[0].affected && singularityDamage[1].destroyed > singularityDamage[0].destroyed);
    const sword = await run(() => {
        flight = false; clearTransientEffects(); selectWeapon(4); stickman.x = 500; stickman.y = 400 + 42 * PLAYER_SCALE; stickman.aimAngle = 0;
        wordBodies = Array.from({length:25}, (_,i) => ({x:510+i*5,y:400,w:3,h:8,vx:0,vy:0,vAngle:0,angle:0,state:'formatted',type:'word'}));
        fireWeapon(.016,0);
        const melee = {affected:wordBodies.filter(w=>w.state!=='formatted').length,destroyed:wordBodies.filter(w=>w.state==='obliterated').length,waves:swordWaves.length};
        clearTransientEffects(); stickman.x=500; stickman.y=400+42*PLAYER_SCALE; stickman.aimAngle=0;
        wordBodies=Array.from({length:30},(_,i)=>({x:550+i*6,y:400,w:3,h:8,vx:0,vy:0,vAngle:0,angle:0,state:'formatted',type:'word'}));
        fireWeapon(.016,1); const range=swordWaves[0].range;
        for(let i=0;i<50;i++) updateSimulation(1/60);
        return {melee,range,affected:wordBodies.filter(w=>w.state!=='formatted').length,waves:swordWaves.length};
    });
    assert(sword.melee.affected>0 && sword.melee.affected<=5 && sword.melee.destroyed===0 && sword.melee.waves===0);
    assert(sword.range<=280 && sword.affected<=8 && sword.waves===0, 'sword must remain weaker and shorter ranged');
    await run(() => { clearTransientEffects(); layoutAcademicPaper(); stickman.resetPosition(); });
    await page.keyboard.press('5'); await page.mouse.move(800,400); await page.mouse.down();
    assert.equal(await run(()=>charge.weapon),4);
    await run(()=>{for(let i=0;i<40;i++) updateSimulation(1/60);}); await page.mouse.up();
    assert.equal(await run(()=>swordWaves.length),1,'holding sword must release an energy wave');

    await run(() => { clearTransientEffects(); layoutAcademicPaper(); stickman.resetPosition(); });
    await page.keyboard.press('f');
    assert.equal(await page.locator('#flightBtn').getAttribute('aria-pressed'), 'true');
    const flightCheck = await run(() => {
        stickman.y = paperRect.y + paperRect.h - 20; stickman.vy = 0;
        const start = stickman.y; keys.w = true;
        for (let i = 0; i < 120; i++) updateSimulation(1 / 60);
        keys.w = false;
        return { start, top: stickman.y, min: paperRect.y + 66 * PLAYER_SCALE, sparks: particles.length };
    });
    assert(flightCheck.top < flightCheck.start - 200 && flightCheck.top >= flightCheck.min && flightCheck.sparks > 0);
    const hover = await run(() => { stickman.vy = 0; const y = stickman.y; for (let i = 0; i < 60; i++) updateSimulation(1 / 60); return Math.abs(stickman.y - y); });
    assert(hover < 1, 'flight hovers without consuming jumps');
    await page.keyboard.press('f');
    assert.equal(await run(() => flight), false);
    assert(await run(() => GATLING_TEXTS.includes('Marginal Contribution') && GATLING_TEXTS.includes('Unreliable Data') && GATLING_TEXTS.includes('Outdated Topic') && GATLING_TEXTS.includes('Fluctuant Results')));
    await page.locator('[data-weapon="1"]').click(); await page.mouse.down();
    await page.keyboard.press('3'); assert.equal(await run(() => charge.active), false);
    await page.mouse.up();
    assert.equal(await run(() => blackHoles.length), 0);
    await page.locator('[data-weapon="1"]').click(); await page.mouse.down();
    await run(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await run(() => charge.active || mouse.down || keys.w), false);
    await page.mouse.up();

    const customText = Array.from({ length: 2500 }, (_, i) => `token${i}`).join(' ') + ' 中文长文测试';
    await page.locator('#openCustomModalBtn').click();
    await page.locator('#customTitleInput').fill('Multi-page imported manuscript');
    await page.locator('#customBodyInput').fill(customText); await page.locator('#applyCustomBtn').click();
    const custom = await run(() => ({ pages: customPages.length, tokens: customPages.join(' ').match(/token\d+/g), chinese: customPages.join('').replace(/\s/g, '').endsWith('中文长文测试') }));
    assert(custom.pages > 1); assert.equal(custom.tokens.length, 2500); assert.equal(new Set(custom.tokens).size, 2500); assert(custom.chinese);
    await page.locator('#nextPageBtn').click();
    assert.equal(await run(() => currentPage), 1);
    await run(() => { triggerRewind(); for (let i = 0; i < 120; i++) updateSimulation(1 / 60); });
    assert.equal(await run(() => rewindMode), false);

    await page.locator('#paperSelect').selectOption('neurips');
    await run(() => { clearTransientEffects(); pageStates.clear(); layoutAcademicPaper(); stickman.resetPosition(); toggleFlight(); selectWeapon(1); mouse.x = 1000; mouse.y = 320; stickman.aimAngle = -.2; beginAttack(); charge.elapsed = 1.45; renderScene(); });
    await page.screenshot({ path: path.resolve(__dirname, '../preview-updated.png') });
    await run(() => { releaseAttack(); for (let i = 0; i < 25; i++) updateSimulation(1 / 60); renderScene(); });
    await page.screenshot({ path: path.resolve(__dirname, '../preview-singularity.png') });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
    assert(await run(() => paperRect.x >= document.getElementById('leftRail').getBoundingClientRect().right));
    assert(await run(() => paperRect.x + paperRect.w < document.getElementById('rightRail').getBoundingClientRect().left));
    await run(() => renderScene()); await page.screenshot({ path: path.resolve(__dirname, '../preview-mobile.png') });
    await page.setViewportSize({ width:1440,height:1000 }); await page.waitForTimeout(100);
    await run(()=>{clearTransientEffects();layoutAcademicPaper();stickman.resetPosition(); if(!flight)toggleFlight();selectWeapon(4);stickman.aimAngle=-.1;fireWeapon(.016,1);renderScene();});
    await page.screenshot({path:path.join(__dirname,'.tmp','ascended-sword.png')});
    await run(()=>{clearTransientEffects();selectWeapon(1);stickman.aimAngle=.55;fireWeapon(.016,1);for(let i=0;i<90;i++)updateSimulation(1/60);renderScene();});
    const well=await run(()=>({radius:blackHoles[0].radius,range:blackHoles[0].pullRadius,progress:blackHoles[0].collapse,ascended:blackHoles[0].ascended}));
    assert(well.radius<=16&&well.range>=300&&well.progress>0&&well.ascended);
    await page.screenshot({path:path.join(__dirname,'.tmp','compact-black-hole.png')});
    await run(()=>{triggerRewind();for(let i=0;i<30;i++)updateSimulation(1/60);renderScene();});
    assert.equal(await run(()=>rewindMode),true,'rewind visual must persist during restoration');
    await page.screenshot({path:path.join(__dirname,'.tmp','rewind-effect.png')});
    await run(()=>{for(let i=0;i<90;i++)updateSimulation(1/60);});
    assert(await run(()=>!rewindMode&&residueCtx.getImageData(0,0,residueCanvas.width,residueCanvas.height).data.every(v=>v===0)),'rewind must clear permanent residue');
    assert.deepEqual(errors, [], 'no browser runtime errors');
    const live = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    live.on('pageerror', error => errors.push(error.message));
    await live.goto(page.url());
    await live.keyboard.press('f'); await live.keyboard.down('w'); await live.waitForTimeout(400); await live.keyboard.up('w');
    await live.keyboard.press('2'); await live.mouse.move(720, 400); await live.mouse.down(); await live.waitForTimeout(650);
    assert(await live.evaluate(() => charge.elapsed > .25 && blackHoles.length === 0));
    await live.mouse.up(); assert(await live.evaluate(() => blackHoles.length === 1));
    await live.waitForTimeout(300); await live.keyboard.press('3'); await live.mouse.down(); await live.waitForTimeout(200); await live.mouse.up();
    await live.keyboard.press('1'); await live.mouse.down(); await live.waitForTimeout(200); await live.mouse.up();
    await live.keyboard.press('4'); await live.mouse.down(); await live.waitForTimeout(300); await live.mouse.up(); await live.waitForTimeout(350);
    assert(await live.evaluate(() => particles.length <= 1800 && wordBodies.some(w => w.state !== 'formatted')));
    assert.deepEqual(errors, [], 'live animation loop must run all weapons without errors');
    console.log('PASS: persistent faint residue + compact growing black-hole collapse + balanced sword melee/energy + ascended weapons + temporal rewind + original game controls');
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
