import { impactStrength } from './hammer.mjs';

const TAU=Math.PI*2;
const ROUTE_PITCH={lava:.86,frost:1.16,storm:1.08,bone:.93,vine:1,carapace:.97,star:1.12,clockwork:.88,holy:1.13,ocean:1.02,ghost:.91,desert:.84};

// Original procedural metal: a short broadband contact, a low anvil body,
// irregular resonances and quiet room reflections. No gameplay random draws.
export function synthesizeStrike(sampleRate,{kind='growth',route,up=false,legendary=false}={}) {
  const flourish=up||kind==='awakening';
  const duration=flourish?1.15:kind==='repair'?.82:.72;
  const samples=new Float32Array(Math.ceil(sampleRate*duration));
  const dry=new Float32Array(samples.length);
  const pitch=(ROUTE_PITCH[route]||1)*(kind==='damage'?.72:1);
  const strength=impactStrength(kind);
  const partials=[[541,.2,.13],[887,.23,.17],[1471,.15,.105],[2317,.09,.075],[3869,.055,.045],[5843,.025,.027]];
  const notes=flourish?(legendary?[660,880,1108,1320]:[740,932,1108]):kind==='repair'?[880,1175]:kind==='surge'?[1046]:[];
  let seed=271828,lowNoise=0;
  for(let i=0;i<samples.length;i++){
    const t=i/sampleRate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    lowNoise=lowNoise*.84+noise*.16;
    const grit=noise-lowNoise;
    let value=.36*Math.sin(TAU*(146*t-90*t*t))*Math.exp(-t/.038);
    value+=.13*Math.sin(TAU*237*t)*Math.exp(-t/.065);
    value+=grit*(.42*Math.exp(-t/.0035)+.11*Math.exp(-t/.023));
    for(const [frequency,volume,decay] of partials){
      const roughOnset=.13*noise*Math.exp(-t*180);
      value+=volume*Math.sin(TAU*frequency*pitch*t+roughOnset)*Math.exp(-t/decay);
    }
    if(kind==='damage'){
      for(const start of [.028,.071]){
        const u=t-start;
        if(u>=0)value+=grit*.14*Math.exp(-u*100);
      }
    }
    for(let n=0;n<notes.length;n++){
      const u=t-(.1+n*.085);
      if(u>=0)value+=.035*Math.sin(TAU*notes[n]*u)*Math.min(1,u/.008)*Math.exp(-u/.19);
    }
    dry[i]=value*strength*Math.min(1,t/.0006);
  }
  const reflections=[[.019,.11],[.043,.065],[.079,.03]].map(([time,gain])=>[Math.round(time*sampleRate),gain]);
  for(let i=0;i<samples.length;i++){
    let value=dry[i];
    for(const [offset,gain] of reflections)if(i>=offset)value+=dry[i-offset]*gain;
    // The limiter keeps the sharper transient comfortable and unclipped.
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.03));
    samples[i]=Math.tanh(value*.95)*.76*fade;
  }
  return samples;
}

export class ForgeAudio {
  constructor(){this.enabled=true;this.context=null;this.voices=new Set();this.buffers=new Map();this.disposed=false;}

  async unlock(){
    if(this.disposed||!this.enabled)return false;
    try{
      if(!this.context){
        const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!AudioContext)return false;
        this.context=new AudioContext({latencyHint:'interactive'});
        this.master=this.context.createGain();this.master.gain.value=.42;
        this.master.connect(this.context.destination);
      }
      if(this.context.state==='suspended')await this.context.resume();
      return this.context.state==='running';
    }catch{return false;}
  }

  setEnabled(enabled){
    this.enabled=enabled;
    if(!enabled)this.stop();
    if(this.master){
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(enabled?.42:0,this.context.currentTime,.006);
    }
    if(enabled)void this.unlock();
  }

  play(event,{route,up=false,legendary=false}={}){
    if(this.disposed||!this.enabled||this.context?.state!=='running')return false;
    try{
      const key=[event.kind,route,up,legendary].join(':');
      let buffer=this.buffers.get(key);
      if(!buffer){
        const samples=synthesizeStrike(this.context.sampleRate,{kind:event.kind,route,up,legendary});
        buffer=this.context.createBuffer(1,samples.length,this.context.sampleRate);
        buffer.copyToChannel(samples,0);this.buffers.set(key,buffer);
      }
      const source=this.context.createBufferSource();source.buffer=buffer;
      source.playbackRate.value=1+(((event.hit||1)*17%5)-2)*.012;
      source.connect(this.master);this.voices.add(source);
      source.onended=()=>{source.disconnect();this.voices.delete(source);};
      source.start();return true;
    }catch{return false;}
  }

  stop(){
    for(const source of this.voices){try{source.stop();}catch{}source.disconnect();}
    this.voices.clear();
  }
  pause(){
    this.stop();
    if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
  }
  dispose(){
    this.disposed=true;this.stop();this.buffers.clear();
    if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});
  }
}
