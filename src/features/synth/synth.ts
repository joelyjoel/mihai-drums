import EventEmitter from "events";
import {PatternEditorState} from "../pattern-editor/patternEditorSlice";
import drumBuffers, {loadDrumBuffers} from "./drums";
import MediaRecorder from '../../MediaRecorderPolyfill';

// @ts-ignore
const AudioContext = window.AudioContext || window.webkitAudioContext;
loadDrumBuffers(new AudioContext());

export class Synth extends EventEmitter {
  
  ctx: AudioContext;
  masterVolume: GainNode;
  playingSources: {[chokeGroup: number]: AudioBufferSourceNode};
  hpf: BiquadFilterNode;
  recorderDestination: MediaStreamAudioDestinationNode;
  mainMix: AudioNode;
  compressor: DynamicsCompressorNode;

  constructor() {
    super();
    this.ctx = new AudioContext();
    this.masterVolume = this.ctx.createGain();
    this.masterVolume.connect(this.ctx.destination);
    this.recorderDestination = this.ctx.createMediaStreamDestination();
    this.masterVolume.connect(this.recorderDestination);
    this.hpf = this.ctx.createBiquadFilter();
    this.hpf.type = 'highpass';
    this.hpf.frequency.value = 30
    this.hpf.Q.value = 10
    this.mainMix = this.hpf
    this.compressor = this.ctx.createDynamicsCompressor();
    this.hpf.connect(this.compressor);
    this.compressor.connect(this.masterVolume);
    this.compressor.threshold.value = -12
    this.compressor.attack.value = 0.004
    this.compressor.release.value = 0.015
    console.log(this.compressor);
    //@ts-ignore
    window.comp = this.compressor

    this.playingSources = {};
  }

  playDrum(name: string, t: number, chokeGroup?: number) {
    try {
      if(chokeGroup !== undefined) {
        if(this.playingSources[chokeGroup])
          this.playingSources[chokeGroup].stop(t+.1);
      }
      let buffer = drumBuffers[name];
      if(!buffer)
        throw `Drum sample does not exist: ${name}`;
      if(buffer === 'pending')
        throw `Attempt to schedule drums before loading them`;
      if(buffer == 'loading')
        throw `Drum sample didn't load in time: "${name}"`;

      if(buffer) {
        let source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.mainMix);
        source.start(t);
        if(chokeGroup !== undefined)
          this.playingSources[chokeGroup] = source;
      } else
        throw `Problem with drum sample: ${name}`;
    } catch(err) {
      console.error(err);
    }
  }

  stop(t: number) {
  }

  gracefulStop(t: number) {
  }

  startRecording() {
    const mimeType = ['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg']
      .filter(MediaRecorder.isTypeSupported)[0]

    let recorder = new MediaRecorder(
      this.recorderDestination.stream,
      {mimeType},
    );
    recorder.start();
    return recorder;
  }

  raiseHPF(t=this.ctx.currentTime, frequency=700) {
    this.hpf.frequency.setTargetAtTime(frequency, t, 30);
  }
  dropHPF(t=this.ctx.currentTime, frequency=30) {
    this.hpf.frequency.setTargetAtTime(frequency, t, 0.1);
  }
}

let persistantSynth: Synth;
export const getPersistantSynth = () => {
  if(!persistantSynth)
    persistantSynth = new Synth();
  return persistantSynth
}

export function playDrums(drums?: string[], chokeGroup?: number) {
  if(drums) {
    let synth = getPersistantSynth();
    for(let drum of drums)
      synth.playDrum(drum, synth.ctx.currentTime, chokeGroup);
  }
}

export function playSequence(
  sequence: PatternEditorState, 
  options:{startTime?: number; looping?:boolean;}={},
  synth = getPersistantSynth(),
) {
  const ctx = synth.ctx;
  const startTime = options.startTime || (ctx.currentTime+.3);
  const at = (t: number, f: () => void) => {
    setTimeout(f, 1000*(t - ctx.currentTime));
  }

  /// Number of steps to schedule at once
  const scheduleChunkSize = Math.ceil(sequence.numberOfSteps / 8);

  const events = new EventEmitter();

  let nextStep = 0;
  let nextStepTime = startTime;

  let playing = true;
  const stop = (t: number = nextStepTime) => {
    playing = false
    synth.stop(t);
    at(t+.2, () => events.emit('finish'))
  }

  let looping = options.looping || false;
  let setLooping = (val: boolean):void => {
    looping = val
  };

  const scheduleMore = () => {
    if(!playing)
      return ;
    events.emit('schedule');
    const stepDuration = 60 / (sequence.tempo * (sequence.stepsPerBeat||2));


    // Schedule the notes
    for(let i=0; i < scheduleChunkSize; ++i) {

      // Handle looping / stopping at end
      if(nextStep >= sequence.numberOfSteps) {
        if(looping)
          nextStep = 0;
        else {
          stop(nextStepTime);
          return ;
        }
      }

      //let step = sequence.steps[nextStep];
      //let {midiNumber, hasDrums, drums} = step;
      //if(midiNumber !== undefined)
        //synth.playNote(midiNumber, nextStepTime);
      //if(hasDrums && drums)
        //for(let drum of drums)
          //synth.playDrum(drum, nextStepTime);
      for(let c=0; c < sequence.channels.length; ++c) {
        let channel = sequence.channels[c];
        if(channel.steps[nextStep])
          synth.playDrum(channel.sampleName, nextStepTime, channel.chokeGroup || c+256);
      }
       
      const stepNumber = nextStep;
      at(nextStepTime, () => events.emit('step', stepNumber))

      nextStep++;
      nextStepTime += stepDuration
    }

    // Schedule next reshedule
    at(nextStepTime - .03, () => scheduleMore());
  }

  const updateSequence = (seq: PatternEditorState) => {
    sequence = seq;
  }

  // Start it running!
  scheduleMore();


  return {
    events,
    setLooping,
    stop,
    updateSequence,
    synth,
  }
}
