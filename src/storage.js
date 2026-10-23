// Character persistence in a JSON file. Passwords are stored as scrypt hashes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAVE_FILE = path.join(DATA_DIR, 'characters.json');

let characters = {}; // lowercase name -> record
let writeTimer = null;

function load() {
  try {
    characters = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read save file:', err.message);
    characters = {};
  }
}

function flush() {
  clearTimeout(writeTimer);
  writeTimer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${SAVE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(characters));
  fs.renameSync(tmp, SAVE_FILE);
}

function scheduleWrite() {
  if (!writeTimer) writeTimer = setTimeout(flush, 2000);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

const key = (name) => name.toLowerCase();

function exists(name) {
  return Object.hasOwn(characters, key(name));
}

function verify(name, password) {
  const rec = characters[key(name)];
  if (!rec) return false;
  const expected = Buffer.from(rec.hash, 'hex');
  const actual = Buffer.from(hashPassword(password, rec.salt), 'hex');
  return crypto.timingSafeEqual(expected, actual);
}

function create(name, password, data) {
  const salt = crypto.randomBytes(16).toString('hex');
  characters[key(name)] = { name, salt, hash: hashPassword(password, salt), data };
  scheduleWrite();
}

function get(name) {
  return characters[key(name)]?.data;
}

function save(name, data) {
  const rec = characters[key(name)];
  if (!rec) return;
  rec.data = data;
  scheduleWrite();
}

load();

module.exports = { exists, verify, create, get, save, flush };
