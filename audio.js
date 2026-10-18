/* Layered mechanical impacts and sustained energy sounds, generated locally. */
class SoundEffects {
    constructor(context = null) {
        this.ctx = context;
        this.output = null;
        this.muted = false;
        this.lastWordTick = 0;
        this.loops = new Map();
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return false;
            this.ctx = new AudioContext();
        }
        if (!this.output) {
            const limiter = this.ctx.createDynamicsCompressor();
            limiter.threshold.value = -15;
            limiter.knee.value = 10;
            limiter.ratio.value = 7;
            limiter.attack.value = .003;
            limiter.release.value = .18;
            this.output = this.ctx.createGain();
            this.output.gain.value = this.muted ? 0 : .58;
            this.output.connect(limiter); limiter.connect(this.ctx.destination);
            this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
            const samples = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
            this.rumbleBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate);
            const rumble = this.rumbleBuffer.getChannelData(0); let brown = 0;
            for (let i = 0; i < rumble.length; i++) { brown = .995 * brown + (Math.random() * 2 - 1) * .035; rumble[i] = brown; }
            const convolver = this.ctx.createConvolver(), impulse = this.ctx.createBuffer(2, this.ctx.sampleRate * 1.6, this.ctx.sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const data = impulse.getChannelData(channel);
                for (let i = 0; i < data.length; i++) data[i] = i < this.ctx.sampleRate * .025 ? 0 : (Math.random() * 2 - 1) * Math.exp(-i / this.ctx.sampleRate * 4.5);
            }
            convolver.buffer = impulse; this.spaceSend = this.ctx.createGain(); this.spaceSend.gain.value = .22;
            this.spaceSend.connect(convolver); convolver.connect(this.output);
            this.driveCurve = Float32Array.from({ length: 512 }, (_, i) => Math.tanh((i / 255.5 - 1) * 2.2));
        }
        if (this.ctx.state === 'suspended' && !this.ctx.startRendering) this.ctx.resume().catch(() => {});
        return true;
    }

    setMuted(value) {
        this.muted = value;
        if (!this.init()) return;
        this.output.gain.setTargetAtTime(value ? 0 : .58, this.ctx.currentTime, .025);
        if (value) this.stopLoops();
    }

    noise(duration, level, frequency, type = 'lowpass', delay = 0, attack = .002) {
        if (this.muted || !this.init()) return;
        const start = this.ctx.currentTime + delay;
        const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
        source.buffer = this.noiseBuffer;
        filter.type = type; filter.frequency.value = frequency; filter.Q.value = .65;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level), start + attack);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        source.connect(filter); filter.connect(gain); gain.connect(this.output);
        source.start(start, Math.random() * .8, duration); source.stop(start + duration + .01);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }

    body(frequency, duration, level, endFrequency = frequency * .65, delay = 0) {
        if (this.muted || !this.init()) return;
        const start = this.ctx.currentTime + delay;
        const oscillator = this.ctx.createOscillator(), drive = this.ctx.createWaveShaper(), gain = this.ctx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
        drive.curve = this.driveCurve;
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(level, start + .003);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(drive); drive.connect(gain); gain.connect(this.output);
        oscillator.start(start); oscillator.stop(start + duration + .01);
        oscillator.onended = () => { oscillator.disconnect(); drive.disconnect(); gain.disconnect(); };
    }

    playGatling() {
        // Powder crack, low receiver impact, and a short bolt cycle at the firing cadence.
        this.noise(.095, .52, 4800, 'lowpass');
        this.noise(.027, .16, 1900, 'highpass');
        this.body(76 + Math.random() * 4, .095, .36, 72);
        this.noise(.023, .09, 2100, 'bandpass', .032);
    }

    playWordDetach() {
        if (performance.now() - this.lastWordTick < 95) return;
        this.lastWordTick = performance.now();
        this.noise(.065, .045, 1700, 'highpass');
    }

    playHammerSlam() {
        this.body(61, .38, .7, 54);
        this.noise(.085, .78, 3500, 'lowpass');
        // Irregular, decaying fracture transients and a dense room tail.
        for (const [delay, level, frequency] of [[.035, .31, 1700], [.072, .2, 2600], [.13, .13, 1100], [.21, .065, 900]]) {
            this.noise(.12, level, frequency, 'bandpass', delay);
        }
        this.noise(.9, .3, 700, 'lowpass', .015, .018);
    }

    playBlackHoleLaunch() {
        this.body(42, .9, .38, 40);
        this.noise(1.1, .3, 170, 'lowpass', 0, .18);
        this.noise(.65, .12, 390, 'bandpass', .04, .08);
    }

    playSupernova() {
        this.body(32.7, 1.5, .65, 31.2);
        this.body(49, .65, .18, 46);
        this.noise(.8, .34, 380, 'bandpass', 0, .045);
        this.noise(1.5, .28, 160, 'lowpass', .03, .08);
    }

    setLoop(name, active, level = 1) {
        if (!active || this.muted) {
            const old = this.loops.get(name);
            if (!old) return;
            const now = this.ctx.currentTime;
            old.gain.gain.cancelScheduledValues(now);
            old.gain.gain.setTargetAtTime(0, now, .025);
            for (const source of old.sources) source.stop(now + .12);
            let ended = 0;
            for (const source of old.sources) source.onended = () => {
                if (++ended === old.sources.length) old.nodes.forEach(node => node.disconnect());
            };
            this.loops.delete(name);
            return;
        }
        if (!this.init()) return;
        const existing = this.loops.get(name);
        if (existing) { existing.gain.gain.setTargetAtTime(level, this.ctx.currentTime, .06); return; }
        const now = this.ctx.currentTime, nodes = [], sources = [];
        const gain = this.ctx.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.setTargetAtTime(level, now, .04);
        gain.connect(this.output); nodes.push(gain);
        if (name === 'blackHole') gain.connect(this.spaceSend);
        const addTone = (frequency, volume, type = 'sine', cutoff = 900) => {
            const oscillator = this.ctx.createOscillator(), filter = this.ctx.createBiquadFilter(), localGain = this.ctx.createGain();
            oscillator.type = type; oscillator.frequency.value = frequency;
            filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .6; localGain.gain.value = volume;
            oscillator.connect(filter); filter.connect(localGain); localGain.connect(gain); oscillator.start(now);
            sources.push(oscillator); nodes.push(oscillator, filter, localGain);
        };
        const noise = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), noiseGain = this.ctx.createGain();
        noise.buffer = name === 'blackHole' ? this.rumbleBuffer : this.noiseBuffer; noise.loop = true;
        filter.type = name === 'laser' ? 'bandpass' : 'lowpass';
        filter.frequency.value = name === 'laser' ? 1250 : 145; filter.Q.value = .7;
        noiseGain.gain.value = name === 'laser' ? .25 : .55;
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(gain); noise.start(now);
        sources.push(noise); nodes.push(noise, filter, noiseGain);
        if (name === 'laser') {
            addTone(62, .09, 'sawtooth', 900); addTone(93.3, .035, 'triangle', 1300); addTone(44, .1);
        } else {
            addTone(29.7, .43); addTone(44.5, .13); addTone(59.4, .045); addTone(193.7, .015, 'sine', 300);
        }
        // Slow amplitude modulation gives the singularity a breathing, beating low end.
        const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
        lfo.frequency.value = name === 'laser' ? 19 : .19;
        depth.gain.value = name === 'laser' ? .018 : .09;
        lfo.connect(depth); depth.connect(noiseGain.gain); lfo.start(now);
        sources.push(lfo); nodes.push(lfo, depth);
        this.loops.set(name, { gain, sources, nodes });
    }

    sync(laser, blackHoles = 0, blackHoleCharge = 0) {
        this.setLoop('laser', laser, .8);
        this.setLoop('blackHole', blackHoles > 0 || blackHoleCharge > 0, blackHoles > 0 ? .72 : .22 + blackHoleCharge * .4);
    }

    stopLoops() { for (const name of [...this.loops.keys()]) this.setLoop(name, false); }
    playRewind() {
        if (this.muted || !this.init()) return;
        const now = this.ctx.currentTime, source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
        source.buffer = this.noiseBuffer; filter.type = 'bandpass'; filter.Q.value = .6;
        filter.frequency.setValueAtTime(240, now); filter.frequency.exponentialRampToValueAtTime(1900, now + .85);
        gain.gain.setValueAtTime(.001, now); gain.gain.exponentialRampToValueAtTime(.35, now + .82); gain.gain.exponentialRampToValueAtTime(.001, now + 1.05);
        source.connect(filter); filter.connect(gain); gain.connect(this.output); gain.connect(this.spaceSend);
        source.start(now); source.stop(now + 1.1);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        this.body(43, .5, .2, 40, .8);
    }
    playSword(energy = false) {
        this.noise(energy ? .32 : .16, energy ? .2 : .14, 2000, 'highpass', 0, .012);
        this.noise(.1, .15, 3100, 'bandpass', .025);
        if (energy) this.body(84, .24, .13, 79);
    }
    playAcceptStamp() { this.body(95, .18, .22, 63); this.noise(.075, .19, 1200); }
}
