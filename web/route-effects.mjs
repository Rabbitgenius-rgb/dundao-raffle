import * as THREE from './vendor/three.module.js';

// These six motifs interpret the approved v5 sheets as actual scene objects.
// Their meshes live with BladeEffects, outside the sword's contact geometry.
export const DISTINCT_EFFECT_ROUTES = new Set(['star','clockwork','holy','ocean','ghost','desert']);

export function createRouteMotif(effects, {route, level, mode, centerY, width}) {
  if (!DISTINCT_EFFECT_ROUTES.has(route) || level < 3) return null;
  const root=new THREE.Group();root.name=`route-motif-${route}`;
  root.position.set(0,centerY,mode==='forge'?.48:-.52);
  effects.root.add(root);
  const moving=[];
  const intensity=(level-2)/4;
  const sideOffset=Math.max(.38,width*.48);
  const box=(parent,x,y,z,w,h,d,color,opacity=.88)=>{
    const mesh=new THREE.Mesh(effects.pixelGeometry,effects.material(color,opacity));
    mesh.position.set(x,y,z);mesh.scale.set(w,h,d);parent.add(mesh);return mesh;
  };
  const bar=(parent,a,b,thickness,color,opacity=.88)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=(b[2]||0)-(a[2]||0);
    const mesh=box(parent,(a[0]+b[0])/2,(a[1]+b[1])/2,((a[2]||0)+(b[2]||0))/2,
      Math.hypot(dx,dy),thickness,Math.max(.025,Math.abs(dz)),color,opacity);
    mesh.rotation.z=Math.atan2(dy,dx);return mesh;
  };
  const animate=(object,fn)=>{moving.push(fn);return object;};

  if(route==='star'){
    const count=2+level;
    for(let i=0;i<count;i++){
      const side=i%2?-1:1, group=new THREE.Group();
      const x=side*(sideOffset+.20+(i%3)*.18),y=-.85+(i%5)*.43;
      group.position.set(x,y,.05);root.add(group);
      const meteor=new THREE.Mesh(effects.shardGeometry,effects.material(i%2?0xffd987:0x91baff,.88));
      meteor.scale.setScalar(.055+(i%3)*.018);group.add(meteor);
      bar(group,[.03,-.02,0],[.30,-.27,0],.035,0xeecb82,.7);
      bar(group,[.10,-.10,0],[.25,-.25,0],.016,0x95c4ff,.72);
      animate(group,t=>{const shift=((t*.15+i*.17)%1-.5)*.26;group.position.set(x-shift,y+shift,.05);});
    }
    for(const side of [-1,1]){
      const x=side*(sideOffset+.26);
      const pts=[[x,-.65,0],[x+side*.17,-.32,0],[x+side*.04,.03,0],[x+side*.20,.31,0]];
      for(let i=0;i<pts.length-1;i++)bar(root,pts[i],pts[i+1],.016,0xe0c17d,.55);
      for(const p of pts)box(root,p[0],p[1],.01,.07,.07,.03,0xffefb4,.9);
    }
  }else if(route==='clockwork'){
    const makeCog=(x,y,r,phase)=>{
      const gear=new THREE.Group();gear.position.set(x,y,.05);root.add(gear);
      box(gear,0,0,0,r*.42,r*.42,.05,0xffc878);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        const tooth=box(gear,Math.cos(a)*r*.82,Math.sin(a)*r*.82,0,r*.55,r*.20,.04,0xd39a59);
        tooth.rotation.z=a;
        bar(gear,[0,0,0],[Math.cos(a)*r*.74,Math.sin(a)*r*.74,0],.025,0xf3c67c,.7);
      }
      animate(gear,t=>{gear.rotation.z=phase+t*(x>0?.48:-.42);});
    };
    for(const side of [-1,1]){
      makeCog(side*(sideOffset+.25),.42,.16+intensity*.08,side);
      if(level>=5)makeCog(side*(sideOffset+.42),-.46,.12+intensity*.06,-side);
      for(let i=0;i<level-1;i++){
        const y=-.65+i*.27,outer=side*(sideOffset+.33+(i%2)*.19);
        bar(root,[side*sideOffset,y,0],[outer,y+.06,0],.055,0xba824e,.75);
        box(root,outer,y+.06,.01,.09,.11,.055,0xffc778,.85);
      }
    }
  }else if(route==='holy'){
    for(const side of [-1,1]){
      const wing=new THREE.Group();root.add(wing);
      const feathers=level+1;
      for(let i=0;i<feathers;i++){
        const s=i/(feathers-1),start=[side*(sideOffset*.62),-.72+s*.27,0];
        const end=[side*(sideOffset+.62+Math.sin(s*Math.PI)*.22-s*.16),-.48+s*1.53,0];
        bar(wing,start,end,.12+intensity*.035,i%2?0xfff6db:0xdceafa,.88);
        const tip=box(wing,end[0],end[1],.02,.09,.16,.035,0xffedbd,.88);tip.rotation.z=-side*.55;
      }
      bar(wing,[side*.25,-.64,0],[side*(sideOffset+1.0),.95,0],.035,0xe8bc68,.8);
      animate(wing,t=>{wing.rotation.z=side*.025*Math.sin(t*1.3);});
    }
    for(let i=0;i<level;i++){
      const side=i%2?-1:1,feather=box(root,side*(sideOffset+.35+(i%3)*.25),-.95+(i%4)*.55,.04,.08,.19,.03,0xfff5df,.76);
      const y=feather.position.y;feather.rotation.z=side*.5;
      animate(feather,t=>{feather.position.y=y+Math.sin(t*.8+i)*.12;feather.rotation.z=side*.5+.1*Math.sin(t+i);});
    }
  }else if(route==='ocean'){
    const wave=new THREE.Group();root.add(wave);
    const crest=sideOffset+.33;
    // Layered blocks form a breaking wave with a broad body and foamy crest.
    // Open water fragments keep the silhouette from reading as a round frame.
    const rows=[
      [-.90,-.80,.20],[-.76,-.65,.40],[-.62,-.50,.55],[-.48,-.35,.65],
      [-.34,-.15,.72],[-.20,.00,.75],[-.06,.08,.78],[.08,.10,.72],
      [.22,.03,.65],[.36,-.10,.55],[.50,-.25,.43],[.64,-.38,.22],[.78,-.42,.05],
    ];
    rows.forEach(([y,left,right],i)=>{
      box(wave,crest+(left+right)/2,y,0,right-left,.145,.09,i%3===0?0x2397a9:0x39c7cb,.66);
      if(i>2&&i<10)box(wave,crest+right-.10,y,.07,.16,.045,.035,0xa7f4ec,.75);
    });
    for(const [x,y] of [[.52,.25],[.49,.40],[.43,.55],[.31,.69],[.17,.81],[.01,.88],[-.15,.91],[-.31,.87],[-.43,.78]])
      box(wave,crest+x,y,.08,.15,.13,.07,0xd2fff5,.94);
    for(const [x,y] of [[-.62,.82],[-.49,1.02],[-.18,1.09],[.15,.98],[.45,.77]])
      box(wave,crest+x,y,.04,.09,.10,.05,0xc5fff5,.85);
    animate(wave,t=>{wave.position.y=Math.sin(t*.9)*.09;wave.rotation.z=Math.sin(t*.55)*.025;});
    for(let i=0;i<level;i++){
      const side=i%2?-1:1,x=side*(sideOffset+.35+(i%3)*.2),y=-.65+(i%4)*.48;
      const fish=new THREE.Group();fish.position.set(x,y,.05);root.add(fish);
      const body=new THREE.Mesh(effects.shardGeometry,effects.material(0xa7f7e9,.85));body.scale.set(.10,.045,.035);fish.add(body);
      const tail=box(fish,-.11,0,0,.07,.07,.025,0x7ae2de,.85);tail.rotation.z=Math.PI/4;
      animate(fish,t=>{fish.position.x=x+Math.sin(t*.8+i)*.13;fish.position.y=y+Math.sin(t+i)*.06;});
    }
  }else if(route==='ghost'){
    const shape=new THREE.Shape();
    shape.moveTo(0,.60);shape.lineTo(-.36,.48);shape.lineTo(-.50,.18);shape.lineTo(-.46,-.45);
    shape.lineTo(-.25,-.30);shape.lineTo(-.10,-.62);shape.lineTo(.08,-.36);shape.lineTo(.29,-.58);
    shape.lineTo(.45,-.31);shape.lineTo(.46,.18);shape.lineTo(.35,.48);shape.closePath();
    const geometry=new THREE.ShapeGeometry(shape);effects.geometries.add(geometry);
    const phantom=new THREE.Group();phantom.position.set(-sideOffset-.38,.48,.01);root.add(phantom);
    const shroud=new THREE.Mesh(geometry,effects.material(0x54e7b2,.20+intensity*.12,THREE.DoubleSide));phantom.add(shroud);
    bar(phantom,[-.42,.14,.02],[-.30,.45,.02],.055,0x8dffcb,.7);
    bar(phantom,[-.30,.45,.02],[0,.56,.02],.055,0x8dffcb,.7);
    bar(phantom,[0,.56,.02],[.30,.45,.02],.055,0x8dffcb,.7);
    const eyes=new THREE.Group();phantom.add(eyes);
    for(const side of [-1,1]){
      const eye=box(eyes,side*.16,.20,.04,.15,.05,.03,0xc6ffe7,1);eye.rotation.z=-side*.26;
      for(let i=0;i<level-1;i++){
        const x=side*(sideOffset+.22+(i%2)*.18),y=-.85+i*.34;
        const flame=new THREE.Group();flame.position.set(x,y,.04);root.add(flame);
        box(flame,0,0,0,.09,.25,.035,0x43e4a6,.5);
        box(flame,side*.04,.15,0,.05,.12,.035,0xa2ffd7,.8);
        animate(flame,t=>{flame.position.y=y+Math.sin(t*1.3+i)*.09;flame.rotation.z=side*.08*Math.sin(t+i);});
      }
    }
    animate(phantom,t=>{phantom.position.y=.48+.07*Math.sin(t*.85);phantom.rotation.z=.035*Math.sin(t*.65);});
    animate(eyes,t=>{eyes.position.y=.025*Math.sin(t*.85);});
  }else if(route==='desert'){
    const pyramid=new THREE.Group();root.add(pyramid);
    const outline=[[-1.12,-.72],[0,.95],[1.12,-.72]];
    for(let i=0;i<outline.length-1;i++)bar(pyramid,[...outline[i],0],[...outline[i+1],0],.045,0xe8bd72,.55);
    for(let i=0;i<4;i++){
      const y=-.68+i*.24,half=(.94-i*.14);
      bar(pyramid,[-half,y,0],[half,y,0],.022,0x9e8059,.45);
    }
    for(let i=0;i<level+2;i++){
      const side=i%2?-1:1,x=side*(sideOffset+.28+(i%3)*.22),y=-.9+(i%5)*.39;
      const stone=box(root,x,y,.03,.10+(i%2)*.06,.11,.05,i%2?0xd4a566:0xffd78d,.72);
      animate(stone,t=>{stone.position.x=x+Math.sin(t*.35+i)*.10;stone.position.y=y+Math.cos(t*.45+i)*.08;});
    }
    for(const side of [-1,1])bar(root,[side*.35,-1.0,0],[side*1.35,-.63,0],.035,0xf1c47a,.6);
  }
  root.userData={route,animatedParts:moving.length,level};
  return {root,update(time){for(const move of moving)move(time);}};
}
