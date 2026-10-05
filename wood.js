class WoodSealTimer {
  constructor() { this.since = null; this.lastSeen = -Infinity; this.until = 0; this.started = 0; }
  update(detected, now) {
    if (detected) {
      if (this.since === null || now - this.lastSeen > 220) this.since = now;
      this.lastSeen = now;
      if (now - this.since >= 850) {
        if (now >= this.until) this.started = now;
        this.until = now + 6500;
      }
    } else if (now - this.lastSeen > 220) this.since = null;
    return now < this.until;
  }
  trigger(now) { if (now >= this.until) this.started = now; this.until = now + 8000; }
}

function createForest() {
  const roots = [
    {width:.070,delay:.05,depth:0,path:[[.12,1.15],[.02,.77],[.02,.26],[.20,.17],[.36,.12],[.39,.28],[.29,.34]]},
    {width:.080,delay:.22,depth:0,path:[[.91,1.15],[1.01,.71],[.94,.19],[.80,.15],[.65,.13],[.66,.30],[.73,.31]]},
    {width:.115,delay:.15,depth:1,path:[[-.12,.98],[.04,.90],[.02,.44],[.19,.44],[.35,.43],[.36,.65],[.26,.62]]},
    {width:.105,delay:.40,depth:1,path:[[1.13,.94],[.90,.92],[.99,.42],[.81,.41],[.67,.42],[.63,.63],[.73,.60]]},
    {width:.125,delay:.08,depth:2,path:[[.24,1.17],[.31,.90],[.10,.82],[.12,.66],[.13,.52],[.30,.50],[.32,.61]]},
    {width:.140,delay:.30,depth:2,path:[[.78,1.18],[.68,.91],[.92,.78],[.90,.64],[.86,.51],[.72,.56],[.70,.66]]},
    {width:.090,delay:.55,depth:2,path:[[-.12,1.07],[.13,.74],[.34,.96],[.39,.83],[.44,.72],[.35,.68],[.32,.73]]},
    {width:.105,delay:.62,depth:2,path:[[1.1,1.10],[.94,.80],[.69,1.03],[.62,.86],[.55,.73],[.63,.68],[.66,.75]]}
  ];
  let seed = 912;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  const dust = Array.from({length:55}, () => ({
    x: random(), vx:(random()-.5)*.22, vy:.15+random()*.23,
    r:.012+random()*.033, delay:random()*.9, spin:random()*6.28
  }));
  return { roots, dust };
}

function rootPoint(path, t, w, h) {
  const section = t < .5 ? 0 : 3, u = t < .5 ? t*2 : (t-.5)*2, v = 1-u;
  const p = path.slice(section, section+4);
  return {
    x: (v*v*v*p[0][0]+3*v*v*u*p[1][0]+3*v*u*u*p[2][0]+u*u*u*p[3][0])*w,
    y: (v*v*v*p[0][1]+3*v*v*u*p[1][1]+3*v*u*u*p[2][1]+u*u*u*p[3][1])*h
  };
}

function rootGeometry(root, progress, w, h, age) {
  const points = [], count = 72, unit = Math.min(w, h);
  const growth = Math.max(0, Math.min(1, progress));
  for (let i = 0; i <= count; i++) {
    const f = i/count, t = f*growth, p = rootPoint(root.path, t, w, h);
    const before = rootPoint(root.path, Math.max(0, t-.002), w, h);
    const after = rootPoint(root.path, Math.min(1, t+.002), w, h);
    const length = Math.hypot(after.x-before.x, after.y-before.y) || 1;
    const nx = -(after.y-before.y)/length, ny = (after.x-before.x)/length;
    const curl = Math.sin(age*1.8 + f*7 + root.delay)*unit*.004*f*f*growth;
    const radius = root.width*unit*Math.pow(1-f, .68)*(.93+.07*Math.sin(t*33))*.5;
    points.push({x: p.x+nx*curl, y: p.y+ny*curl, nx, ny, radius});
  }
  return points;
}

function drawGiantRoot(c, root, progress, w, h, age) {
  if (progress <= 0) return;
  const points = rootGeometry(root, progress, w, h, age), unit = Math.min(w, h);
  c.save();
  c.beginPath();
  points.forEach((p, i) => {
    const x = p.x+p.nx*p.radius, y = p.y+p.ny*p.radius;
    if (i===0) c.moveTo(x,y); else c.lineTo(x,y);
  });
  for (let i = points.length-1; i >= 0; i--) {
    const p = points[i];
    c.lineTo(p.x-p.nx*p.radius, p.y-p.ny*p.radius);
  }
  c.closePath();
  const shade = c.createLinearGradient(0, h, w*.75, 0);
  shade.addColorStop(0, '#2b211c');
  shade.addColorStop(.45, root.depth===0 ? '#70604a' : '#8b7150');
  shade.addColorStop(.75, '#bba17a');
  shade.addColorStop(1, '#68513c');
  c.shadowColor = '#100b0980';
  c.shadowBlur = unit*.015;
  c.shadowOffsetY = unit*.008;
  c.fillStyle = shade;
  c.fill();
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  c.strokeStyle = '#221a16';
  c.lineWidth = Math.max(1.3, unit*.003);
  c.stroke();
  c.clip();
  for (let stripe = 0; stripe < 13; stripe++) {
    const offset = -.94 + stripe*.15;
    c.beginPath();
    points.forEach((p, i) => {
      const grain = offset + Math.sin(i*.29 + stripe*2.8)*.045;
      const x = p.x+p.nx*p.radius*grain, y = p.y+p.ny*p.radius*grain;
      if (i===0) c.moveTo(x,y); else c.lineTo(x,y);
    });
    c.strokeStyle = stripe%3===0 ? '#e0c29580' : '#35271ca0';
    c.lineWidth = Math.max(.7, unit*(stripe%3===0 ? .0025 : .0016));
    c.stroke();
  }
  for (let i = 8; i < points.length-8; i += 9) {
    const p = points[i], q = points[i+3], side = i%2 ? 1 : -1;
    c.beginPath();
    c.moveTo(p.x+p.nx*p.radius*.8*side, p.y+p.ny*p.radius*.8*side);
    c.lineTo(q.x+q.nx*q.radius*.12*side, q.y+q.ny*q.radius*.12*side);
    c.strokeStyle = '#2b201bb0';
    c.lineWidth = Math.max(1, unit*.002);
    c.stroke();
  }
  c.restore();
}

function drawRootScene(c, forest, w, h, age, alpha) {
  const unit = Math.min(w, h);
  c.save();
  c.globalAlpha = alpha;
  const ground = c.createLinearGradient(0, h*.64, 0, h);
  ground.addColorStop(0, '#20190f00');
  ground.addColorStop(1, '#24190d88');
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  for (const root of forest.roots) {
    const t = Math.max(0, Math.min(1, (age-root.delay)/1.65));
    const growth = 1 - Math.pow(1-t, 2);
    drawGiantRoot(c, root, growth, w, h, age);
  }
  for (const p of forest.dust) {
    const t = age - p.delay;
    if (t < 0 || t > 2.4) continue;
    const fade = Math.max(0, 1-t/2.4);
    const x = (p.x+p.vx*t)*w, y = (1.02-p.vy*t+.07*t*t)*h;
    c.save();
    c.globalAlpha = alpha*fade*.28;
    const radius = p.r*unit*(1+t*1.5);
    const dust = c.createRadialGradient(x, y, 0, x, y, radius);
    dust.addColorStop(0, '#b7a58c');
    dust.addColorStop(1, '#b7a58c00');
    c.fillStyle = dust;
    c.fillRect(x-radius, y-radius, radius*2, radius*2);
    c.globalAlpha = alpha*fade;
    c.translate(x, y);
    c.rotate(p.spin + t*3);
    c.fillStyle = '#65513c';
    c.strokeStyle = '#302319';
    c.lineWidth = 1;
    const r = p.r*unit*.22;
    c.beginPath();
    c.moveTo(-r, -r*.3);
    c.lineTo(-r*.2, -r);
    c.lineTo(r, r*.15);
    c.lineTo(r*.3, r*.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
  c.restore();
}

class WoodRelease {
  constructor(video, canvas, status, button) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.status = status;
    this.timer = new WoodSealTimer();
    this.forest = createForest();
    this.active = false;

    if (button) {
      button.addEventListener('click', () => {
        this.timer.trigger(performance.now());
        this.active = true;
        if (this.status) this.status.textContent = 'MỘC ĐỘN · THỤ GIỚI GIÁNG ĐẢN';
      });
    }
    requestAnimationFrame(t => this.render(t));
  }

  update(detected) {
    const now = performance.now();
    this.active = this.timer.update(detected, now);
    if (this.status) {
      this.status.textContent = this.active
        ? 'MỘC ĐỘN · THỤ GIỚI GIÁNG ĐẢN'
        : detected
          ? `Đang kết ấn Mộc độn… ${Math.min(100, Math.round((now-this.timer.since)/850*100))}%`
          : 'Tay trái: chữ V • Giữ 0,9 giây';
    }
    return detected;
  }

  render(now) {
    const w = innerWidth, h = innerHeight, c = this.ctx;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    c.clearRect(0, 0, w, h);
    const wasActive = this.active;
    this.active = now < this.timer.until;
    if (wasActive && !this.active && this.status) {
      this.status.textContent = 'Tay trái: chữ V • Giữ 0,9 giây';
    }
    if (this.active) this.drawScene(c, w, h, now);
    requestAnimationFrame(t => this.render(t));
  }

  drawScene(c, w, h, now) {
    const age = Math.max(0, (now-this.timer.started)/1000);
    const alpha = Math.max(0, Math.min(1, age*4, (this.timer.until-now)/1000));
    drawRootScene(c, this.forest, w, h, age, alpha);
  }
}

window.WoodRelease = WoodRelease;