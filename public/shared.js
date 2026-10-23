// Game data shared by the server (require) and the browser (window.GAME_DATA).
(function (root) {
  // Skill types:
  //   nuke       big damage to the nearest germ in range
  //   heal       heal yourself and teammates within radius
  //   stun       damage + stun germs around you
  //   buff       double attack speed for teammates within radius
  //   aoe        damage every germ around you
  //   aoeTarget  damage every germ around the nearest germ in range
  //   mark       germs around you take +50% damage for a while
  //   beam       damage every germ in a straight line in front of you
  //   calm       germs around you forget you and freeze, teammates heal a little
  const CLASSES = {
    doctor: {
      name: 'หมอ', icon: '🩺', color: '#4fa3f7',
      weapon: 'หูฟังแพทย์ (Stethoscope)', hp: 110, range: 85, dmg: 12, cd: 0.6, ranged: false,
      skill: { name: 'ฉีดยาปฏิชีวนะเข้มข้น', type: 'nuke', cd: 6, power: 60, range: 130, desc: 'ฉีดยาใส่เชื้อตัวเดียว แรงจนเชื้อร้องขอชีวิต' },
    },
    nurse: {
      name: 'พยาบาล', icon: '💉', color: '#f78fb3',
      weapon: 'เข็มฉีดยา', hp: 100, range: 75, dmg: 9, cd: 0.4, ranged: false,
      skill: { name: 'ให้น้ำเกลือทั้งวอร์ด', type: 'heal', cd: 10, power: 50, radius: 220, desc: 'ฟื้น HP ตัวเองและเพื่อนรอบตัว' },
    },
    pt: {
      name: 'นักกายภาพบำบัด', icon: '🦵', color: '#2ecc71',
      weapon: 'ยางยืดบริหาร (Theraband)', hp: 115, range: 110, dmg: 10, cd: 0.65, ranged: false,
      skill: { name: 'ดัดเส้นสลายพังผืด', type: 'stun', cd: 9, power: 15, radius: 150, duration: 2.5, desc: 'ยืดเส้นเชื้อรอบตัวจนตะคริวกิน ขยับไม่ได้' },
    },
    ot: {
      name: 'นักกิจกรรมบำบัด', icon: '🧩', color: '#f5a623',
      weapon: 'บล็อกไม้ฝึกมือ', hp: 100, range: 200, dmg: 9, cd: 0.6, ranged: true,
      skill: { name: 'ฝึกทักษะการทำงาน', type: 'buff', cd: 15, radius: 250, duration: 8, desc: 'เพื่อนรอบตัวโจมตีเร็วขึ้น 2 เท่า' },
    },
    dentist: {
      name: 'ทันตแพทย์', icon: '🦷', color: '#7fc8f8',
      weapon: 'สว่านกรอฟัน', hp: 110, range: 70, dmg: 14, cd: 0.55, ranged: false,
      skill: { name: 'ขูดหินปูนรอบวง', type: 'aoe', cd: 7, power: 35, radius: 130, desc: 'กรอเชื้อทุกตัวรอบตัว วี้ดดดด' },
    },
    pharmacist: {
      name: 'เภสัชกร', icon: '💊', color: '#9b59b6',
      weapon: 'ขวดยาแคปซูล', hp: 95, range: 230, dmg: 10, cd: 0.7, ranged: true,
      skill: { name: 'พ่นยาครบโดส', type: 'aoeTarget', cd: 8, power: 40, range: 300, radius: 120, desc: 'โยนยาใส่ฝูงเชื้อ ทานให้ครบนะ' },
    },
    medtech: {
      name: 'นักเทคนิคการแพทย์', icon: '🔬', color: '#1abc9c',
      weapon: 'หลอดเก็บเลือด', hp: 95, range: 210, dmg: 9, cd: 0.55, ranged: true,
      skill: { name: 'ส่องกล้องหาจุดอ่อน', type: 'mark', cd: 12, radius: 250, duration: 8, desc: 'เชื้อรอบตัวโดนดาเมจเพิ่ม 50% จากทุกคน' },
    },
    radtech: {
      name: 'นักรังสีเทคนิค', icon: '☢️', color: '#f1c40f',
      weapon: 'ปืนเอกซเรย์', hp: 95, range: 260, dmg: 11, cd: 0.8, ranged: true,
      skill: { name: 'ยิง CT Scan ทะลุทะลวง', type: 'beam', cd: 8, power: 45, length: 450, width: 40, desc: 'ลำแสงตรงไปข้างหน้า ทะลุทุกตัวที่ขวาง' },
    },
    psychologist: {
      name: 'นักจิตวิทยา', icon: '🧠', color: '#e67e22',
      weapon: 'ลูกตุ้มสะกดจิต', hp: 100, range: 180, dmg: 9, cd: 0.6, ranged: true,
      skill: { name: 'ปรึกษาเชิงลึก', type: 'calm', cd: 12, power: 25, radius: 200, duration: 5, desc: 'เชื้อรอบตัวสงบลงและลืมความแค้น เพื่อนหายเครียดได้ HP' },
    },
  };

  // Equipment slots: head, body, hands, feet, accessory. Consumables have `heal`.
  // Stats: atk (flat damage), def (flat damage reduction), hp (max HP), speed (px/s)
  const SLOTS = { head: 'หัว', body: 'ตัว', hands: 'มือ', feet: 'เท้า', accessory: 'เครื่องประดับ' };
  const ITEMS = {
    mask: { name: 'หน้ากากอนามัย', icon: '😷', slot: 'head', def: 1 },
    n95: { name: 'หน้ากาก N95', icon: '😷', slot: 'head', def: 3, hp: 10 },
    faceshield: { name: 'เฟซชิลด์', icon: '🥽', slot: 'head', def: 5, hp: 25 },
    gown: { name: 'เสื้อกาวน์', icon: '🥼', slot: 'body', hp: 25, def: 1 },
    scrubs: { name: 'ชุดสครับ', icon: '👕', slot: 'body', hp: 40, atk: 2 },
    ppe: { name: 'ชุด PPE', icon: '🦺', slot: 'body', hp: 70, def: 4 },
    gloves: { name: 'ถุงมือยาง', icon: '🧤', slot: 'hands', atk: 2 },
    surgicalGloves: { name: 'ถุงมือผ่าตัดปลอดเชื้อ', icon: '🧤', slot: 'hands', atk: 5, def: 1 },
    crocs: { name: 'รองเท้า Crocs', icon: '🩴', slot: 'feet', speed: 15 },
    runners: { name: 'รองเท้าวิ่งเวรดึก', icon: '👟', slot: 'feet', speed: 30, def: 1 },
    idBadge: { name: 'บัตรพนักงาน', icon: '🪪', slot: 'accessory', hp: 15, atk: 1 },
    pen: { name: 'ปากกาเซ็นใบสั่งยา', icon: '🖊️', slot: 'accessory', atk: 4 },
    award: { name: 'โล่บุคลากรดีเด่น', icon: '🏅', slot: 'accessory', atk: 8, hp: 60, def: 3 },
    gel: { name: 'เจลแอลกอฮอล์', icon: '🧴', heal: 40 },
    ors: { name: 'ผงเกลือแร่ ORS', icon: '🥤', heal: 80 },
    vitc: { name: 'วิตามินซี', icon: '🍊', heal: 150 },
  };

  // shape: virus (spiky ball), bacteria (rod), fungus (fuzzy blob), worm (segmented)
  // drops: [itemId, chance] rolled independently on each kill
  const GERMS = {
    cold: { name: 'ไวรัสหวัด', shape: 'virus', color: '#7ec8e3', hp: 25, dmg: 4, speed: 70, xp: 10, aggro: 160, size: 15, drops: [['gel', 0.25], ['mask', 0.05]] },
    ecoli: { name: 'แบคทีเรียท้องเสีย', shape: 'bacteria', color: '#c9a227', hp: 45, dmg: 6, speed: 90, xp: 18, aggro: 170, size: 17, drops: [['gel', 0.25], ['ors', 0.08], ['gloves', 0.04]] },
    caries: { name: 'เชื้อฟันผุ', shape: 'bacteria', color: '#d9ccb0', hp: 55, dmg: 9, speed: 100, xp: 30, aggro: 180, size: 16, drops: [['gel', 0.2], ['idBadge', 0.04]] },
    fungus: { name: 'เชื้อราน้ำกัดเท้า', shape: 'fungus', color: '#9b7fd1', hp: 70, dmg: 8, speed: 55, xp: 28, aggro: 150, size: 20, drops: [['ors', 0.12], ['crocs', 0.04]] },
    flu: { name: 'ไวรัสไข้หวัดใหญ่', shape: 'virus', color: '#e86a6a', hp: 110, dmg: 13, speed: 105, xp: 60, aggro: 210, size: 21, drops: [['ors', 0.15], ['n95', 0.05], ['gown', 0.05]] },
    superbug: { name: 'เชื้อดื้อยา', shape: 'bacteria', color: '#3fbf8f', hp: 220, dmg: 18, speed: 85, xp: 140, aggro: 220, size: 26, drops: [['vitc', 0.2], ['scrubs', 0.06], ['pen', 0.05]] },
    boss: { name: 'ราชาซูเปอร์บั๊ก', shape: 'virus', color: '#8b1e3f', hp: 1500, dmg: 30, speed: 75, xp: 1200, aggro: 260, size: 48, boss: true, drops: [['award', 0.5], ['ppe', 0.5], ['vitc', 1]] },

    // Lung
    tb: { name: 'เชื้อวัณโรค', shape: 'bacteria', color: '#c0392b', hp: 160, dmg: 16, speed: 80, xp: 90, aggro: 200, size: 20, drops: [['vitc', 0.12], ['n95', 0.08], ['faceshield', 0.03]] },
    pneumo: { name: 'เชื้อปอดบวม', shape: 'virus', color: '#ff9ff3', hp: 120, dmg: 14, speed: 110, xp: 70, aggro: 210, size: 18, drops: [['ors', 0.2], ['n95', 0.06]] },
    lungBoss: { name: 'ราชินีวัณโรค', shape: 'bacteria', color: '#7b241c', hp: 2500, dmg: 32, speed: 70, xp: 2000, aggro: 280, size: 52, boss: true, drops: [['faceshield', 0.6], ['award', 0.3], ['vitc', 1]] },

    // Gut
    salmonella: { name: 'ซาลโมเนลลา', shape: 'bacteria', color: '#e67e22', hp: 90, dmg: 11, speed: 115, xp: 45, aggro: 190, size: 17, drops: [['ors', 0.2], ['scrubs', 0.04]] },
    roundworm: { name: 'พยาธิตัวกลม', shape: 'worm', color: '#f5cba7', hp: 130, dmg: 12, speed: 60, xp: 60, aggro: 170, size: 18, drops: [['ors', 0.15], ['runners', 0.04]] },
    gutBoss: { name: 'พยาธิตัวตืดยักษ์', shape: 'worm', color: '#d35400', hp: 2000, dmg: 26, speed: 65, xp: 1600, aggro: 260, size: 40, boss: true, drops: [['surgicalGloves', 0.6], ['runners', 0.4], ['vitc', 1]] },

    // Mouth
    tartar: { name: 'หินปูนมีชีวิต', shape: 'fungus', color: '#e8dfb0', hp: 100, dmg: 10, speed: 45, xp: 40, aggro: 150, size: 22, drops: [['gel', 0.3], ['idBadge', 0.05]] },
    candida: { name: 'เชื้อราแคนดิดา', shape: 'fungus', color: '#d7bde2', hp: 80, dmg: 12, speed: 70, xp: 45, aggro: 180, size: 19, drops: [['ors', 0.15], ['gloves', 0.06]] },
    mouthBoss: { name: 'ราชาฟันผุ', shape: 'virus', color: '#5d4037', hp: 1800, dmg: 24, speed: 70, xp: 1400, aggro: 260, size: 44, boss: true, drops: [['pen', 0.6], ['surgicalGloves', 0.3], ['vitc', 1]] },
  };

  // Every zone has a safe area (spawn point, fast regen) and germs spawning in a
  // distance band [min, max] from the safe-area center. Portals link zones.
  const ZONES = {
    hospital: {
      name: 'โรงพยาบาล', width: 2400, height: 2400, floor: ['#cfe7e4', '#c2dfdb'],
      safe: { x: 1200, y: 1200, r: 220, label: '🏥 โรงพยาบาล' },
      portals: [
        { to: 'mouth', x: 1560, y: 1200, minLevel: 3, label: '🦷 ช่องปาก' },
        { to: 'gut', x: 1200, y: 1560, minLevel: 5, label: '🌀 ลำไส้' },
        { to: 'lung', x: 840, y: 1200, minLevel: 8, label: '🫁 ปอด' },
      ],
      spawns: [
        { kind: 'cold', count: 35, band: [320, 800] },
        { kind: 'ecoli', count: 25, band: [420, 1000] },
        { kind: 'caries', count: 12, band: [500, 1200] },
        { kind: 'fungus', count: 15, band: [600, 1300] },
        { kind: 'flu', count: 10, band: [900, 1600] },
        { kind: 'superbug', count: 5, band: [1100, 1650] },
      ],
      boss: { kind: 'boss', x: 260, y: 260, respawn: 90, label: '☠ ห้องแล็บเชื้อหลุด' },
    },
    mouth: {
      name: 'ดันเจี้ยนช่องปาก', width: 1600, height: 1600, floor: ['#ffd6e0', '#fbc4d3'],
      safe: { x: 800, y: 1450, r: 110, label: '🪥 จุดพักแปรงฟัน' },
      portals: [{ to: 'hospital', x: 800, y: 1540, label: '🏥 กลับโรงพยาบาล' }],
      spawns: [
        { kind: 'caries', count: 20, band: [200, 900] },
        { kind: 'tartar', count: 16, band: [300, 1300] },
        { kind: 'candida', count: 14, band: [500, 1500] },
      ],
      boss: { kind: 'mouthBoss', x: 800, y: 220, respawn: 120, label: '👑 บัลลังก์ฟันกรามผุ' },
    },
    gut: {
      name: 'ดันเจี้ยนลำไส้', width: 1600, height: 1600, floor: ['#f3e0c0', '#ecd5ad'],
      safe: { x: 800, y: 1450, r: 110, label: '🥤 จุดพักจิบ ORS' },
      portals: [{ to: 'hospital', x: 800, y: 1540, label: '🏥 กลับโรงพยาบาล' }],
      spawns: [
        { kind: 'ecoli', count: 18, band: [200, 900] },
        { kind: 'salmonella', count: 16, band: [300, 1300] },
        { kind: 'roundworm', count: 14, band: [500, 1500] },
      ],
      boss: { kind: 'gutBoss', x: 800, y: 220, respawn: 120, label: '🪱 รังพยาธิ' },
    },
    lung: {
      name: 'ดันเจี้ยนปอด', width: 1600, height: 1600, floor: ['#f8d7da', '#f5c6cb'],
      safe: { x: 800, y: 1450, r: 110, label: '💨 จุดพักสูดออกซิเจน' },
      portals: [{ to: 'hospital', x: 800, y: 1540, label: '🏥 กลับโรงพยาบาล' }],
      spawns: [
        { kind: 'flu', count: 14, band: [200, 900] },
        { kind: 'pneumo', count: 16, band: [300, 1300] },
        { kind: 'tb', count: 12, band: [500, 1500] },
      ],
      boss: { kind: 'lungBoss', x: 800, y: 220, respawn: 150, label: '👑 ถุงลมราชินี' },
    },
  };

  const NPCS = {
    director: { name: 'ผอ.ใจดี', icon: '👨‍⚕️', zone: 'hospital', x: 1200, y: 1100, idle: 'โรงพยาบาลเราปลอดภัยได้เพราะทุกคนเลยนะ ขอบใจมาก!' },
    patient: { name: 'ลุงสมชาย (คนไข้)', icon: '🤒', zone: 'hospital', x: 1100, y: 1280, idle: 'ลุงสบายดีแล้ว ขอบใจหมอมากนะ ไปเที่ยวต่อละ' },
    headNurse: { name: 'หัวหน้าพยาบาลแม่ศรี', icon: '👩‍⚕️', zone: 'hospital', x: 1300, y: 1280, idle: 'ล้างมือก่อนกินข้าวด้วยนะลูก' },
  };

  // Quests are offered by an NPC in order; `requires` must be finished first.
  const QUESTS = {
    q1: { npc: 'director', name: 'เคสแรกของน้องใหม่', target: 'cold', count: 8, xp: 80, items: [['gel', 3]],
      offer: 'ยินดีต้อนรับเข้าเวร! ไวรัสหวัดระบาดรอบโรงพยาบาล ช่วยจัดการ 8 ตัวหน่อยนะ', done: 'เก่งมาก! เอาเจลแอลกอฮอล์ไปใช้ ล้างมือบ่อย ๆ ล่ะ' },
    q2: { npc: 'director', requires: 'q1', name: 'ท้องเสียระบาด', target: 'ecoli', count: 8, xp: 200, items: [['gown', 1]],
      offer: 'ส้มตำร้านหน้าโรงพยาบาลมีปัญหา แบคทีเรียท้องเสียเต็มไปหมด ปราบ 8 ตัว!', done: 'ห้องน้ำว่างแล้ว! รับเสื้อกาวน์ไปเลย สมเป็นบุคลากรตัวจริง' },
    q3: { npc: 'director', requires: 'q2', name: 'บุกช่องปาก', target: 'tartar', count: 8, xp: 450, items: [['scrubs', 1]],
      offer: 'คนไข้ไม่แปรงฟันมา 3 ปี! เข้าประตูช่องปาก (Lv.3+) ไปจัดการหินปูนมีชีวิต 8 ก้อน', done: 'ลมหายใจสดชื่นขึ้นเยอะเลย นี่ชุดสครับสำหรับเธอ' },
    q4: { npc: 'director', requires: 'q3', name: 'ปอดวิกฤต', target: 'tb', count: 6, xp: 1200, items: [['n95', 1], ['vitc', 2]],
      offer: 'ผู้ป่วยไอเรื้อรัง! เข้าประตูปอด (Lv.8+) แล้วกำจัดเชื้อวัณโรค 6 ตัว ใส่หน้ากากด้วยนะ', done: 'ฟิล์มปอดใสแจ๋ว! รับ N95 กับวิตามินซีไป' },
    q5: { npc: 'director', requires: 'q4', name: 'ศึกสุดท้ายแห่งแล็บ', target: 'boss', count: 1, xp: 3000, items: [['award', 1]],
      offer: 'ราชาซูเปอร์บั๊กหลุดจากแล็บมุมซ้ายบน! รวมทีมสหวิชาชีพไปปราบมันซะ', done: 'เธอคือบุคลากรดีเด่นประจำปี! รับโล่นี้ไปเลย 🏅' },

    p1: { npc: 'patient', name: 'ลุงคันเท้า', target: 'fungus', count: 6, xp: 220, items: [['crocs', 1]],
      offer: 'หมอ ๆ ลุงคันเท้ามาก เชื้อราน้ำกัดเท้ามันวิ่งหนีไปข้างนอก ช่วยจับ 6 ตัวให้หน่อย', done: 'หายคันแล้ว! เอารองเท้า Crocs คู่โปรดของลุงไปเลย' },
    p2: { npc: 'patient', requires: 'p1', name: 'ลุงปวดท้อง', target: 'roundworm', count: 6, xp: 700, items: [['ors', 4]],
      offer: 'ลุงกินปลาดิบมา... ท้องมันบิด ๆ เข้าไปในลำไส้ (Lv.5+) ปราบพยาธิตัวกลม 6 ตัวทีนะ', done: 'โล่งท้องสุด ๆ! ลุงมีเกลือแร่เหลือ เอาไปเลย' },

    n1: { npc: 'headNurse', name: 'ไข้หวัดใหญ่ระบาด', target: 'flu', count: 5, xp: 500, items: [['mask', 1], ['ors', 2]],
      offer: 'วอร์ดเต็มแล้วลูก! ไข้หวัดใหญ่ระบาดอยู่แถบนอกเมือง ปราบมาสัก 5 ตัว', done: 'เตียงว่างแล้ว ขอบใจจ้ะ ใส่หน้ากากไว้นะ' },
    n2: { npc: 'headNurse', requires: 'n1', name: 'ราชาฟันผุ', target: 'mouthBoss', count: 1, xp: 1600, items: [['pen', 1]],
      offer: 'ราชาฟันผุยึดบัลลังก์ฟันกรามอยู่ในช่องปาก ไปถอนมันออกมาที!', done: 'ถอนสำเร็จ! เอาปากกาเซ็นใบสั่งยาด้ามโปรดไป' },
    n3: { npc: 'headNurse', requires: 'n2', name: 'พยาธิตัวตืดยักษ์', target: 'gutBoss', count: 1, xp: 2000, items: [['surgicalGloves', 1]],
      offer: 'มีพยาธิตัวตืดยาวกว่ารถไฟอยู่ในลำไส้! ใส่ถุงมือให้ดีแล้วไปจัดการมัน', done: 'ยาวจริงอะไรจริง... เก่งมากลูก รับถุงมือผ่าตัดไป' },
  };

  const data = { CLASSES, SLOTS, ITEMS, GERMS, ZONES, NPCS, QUESTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GAME_DATA = data;
})(this);
