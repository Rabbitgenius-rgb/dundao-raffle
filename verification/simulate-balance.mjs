import { pathToFileURL } from 'node:url';
import { createGame, advance, getTier, QUALITY_TIERS, TOTAL_HITS } from '../web/game.mjs';

export function seededRandom(seed) {
  let value=seed>>>0;
  return ()=>{
    value=(value+0x6D2B79F5)>>>0;
    let t=value;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

// Run the production state transitions, including first-hit protection,
// repair eligibility, score caps and final-hit damage. No parallel rule copy.
export function simulateBalance(games=100000,seed=20261113) {
  if(!Number.isSafeInteger(games)||games<1)throw new RangeError('games must be a positive integer');
  const rng=seededRandom(seed);
  const counts=QUALITY_TIERS.map(()=>0),wounds=[0,0,0,0];
  const events={growth:0,surge:0,awakening:0,damage:0,repair:0};
  let totalScore=0;
  for(let index=0;index<games;index++){
    let state=createGame(undefined,rng);
    while(!state.complete)state=advance(state,rng);
    counts[getTier(state.score).level]++;
    wounds[state.damage.length]++;
    totalScore+=state.score;
    for(const event of state.history)events[event.kind]++;
  }
  return {
    games,seed,hitsPerGame:TOTAL_HITS,
    tiers:QUALITY_TIERS.map((tier,i)=>({name:tier.name,count:counts[i],percent:counts[i]/games*100})),
    averageScore:totalScore/games,
    completeBladePercent:wounds[0]/games*100,
    damagedBladePercent:(games-wounds[0])/games*100,
    endingWounds:wounds,eventCounts:events,
    damagePerEligibleStrikePercent:events.damage/(games*(TOTAL_HITS-1))*100,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log(JSON.stringify(simulateBalance(Number(process.argv[2]||1000000),Number(process.argv[3]||20261113)),null,2));
}
