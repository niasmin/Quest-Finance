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

  // shape: virus (spiky ball), bacteria (rod), fungus (fuzzy blob)
  const GERMS = {
    cold: { name: 'ไวรัสหวัด', shape: 'virus', color: '#7ec8e3', hp: 25, dmg: 4, speed: 70, xp: 10, aggro: 160, size: 15, count: 35, zone: [300, 800] },
    ecoli: { name: 'แบคทีเรียท้องเสีย', shape: 'bacteria', color: '#c9a227', hp: 45, dmg: 6, speed: 90, xp: 18, aggro: 170, size: 17, count: 25, zone: [400, 1000] },
    caries: { name: 'เชื้อฟันผุ', shape: 'bacteria', color: '#d9ccb0', hp: 55, dmg: 9, speed: 100, xp: 30, aggro: 180, size: 16, count: 12, zone: [500, 1200] },
    fungus: { name: 'เชื้อราน้ำกัดเท้า', shape: 'fungus', color: '#9b7fd1', hp: 70, dmg: 8, speed: 55, xp: 28, aggro: 150, size: 20, count: 15, zone: [600, 1300] },
    flu: { name: 'ไวรัสไข้หวัดใหญ่', shape: 'virus', color: '#e86a6a', hp: 110, dmg: 13, speed: 105, xp: 60, aggro: 210, size: 21, count: 10, zone: [900, 1600] },
    superbug: { name: 'เชื้อดื้อยา', shape: 'bacteria', color: '#3fbf8f', hp: 220, dmg: 18, speed: 85, xp: 140, aggro: 220, size: 26, count: 5, zone: [1100, 1650] },
    boss: { name: 'ราชาซูเปอร์บั๊ก', shape: 'virus', color: '#8b1e3f', hp: 1500, dmg: 30, speed: 75, xp: 1200, aggro: 260, size: 48, count: 1, boss: true, respawn: 90 },
  };

  const data = { CLASSES, GERMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GAME_DATA = data;
})(this);
