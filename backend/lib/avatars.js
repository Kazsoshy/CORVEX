import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const AVATAR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'avatars');
const MAX_BYTES = 2 * 1024 * 1024;
const FILE_NAME = /^[1-9]\d{0,9}\.(jpg|png|webp)$/;

function matches(buffer, mime) {
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buffer.length >= 8
      && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
  }
  if (mime === 'image/webp') {
    return buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export function detectAvatarImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32 || buffer.length > MAX_BYTES) return null;
  if (matches(buffer, 'image/jpeg')) return { mime: 'image/jpeg', ext: 'jpg' };
  if (matches(buffer, 'image/png')) return { mime: 'image/png', ext: 'png' };
  if (matches(buffer, 'image/webp')) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function avatarContentType(fileName) {
  if (String(fileName).endsWith('.png')) return 'image/png';
  if (String(fileName).endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function avatarPath(fileName) {
  if (!FILE_NAME.test(String(fileName || ''))) return null;
  const full = path.resolve(AVATAR_DIR, fileName);
  if (!full.startsWith(path.resolve(AVATAR_DIR) + path.sep)) return null;
  return full;
}

export async function saveAvatarFile(userId, buffer, ext) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user.');
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const name = `${id}.${ext}`;
  const destination = avatarPath(name);
  if (!destination) throw new Error('Invalid avatar name.');
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, buffer);
  await fs.rename(temporary, destination);
  await Promise.all(['jpg', 'png', 'webp'].filter((item) => item !== ext).map((item) => (
    fs.unlink(path.join(AVATAR_DIR, `${id}.${item}`)).catch(() => {})
  )));
  return name;
}

export async function readAvatarFile(fileName) {
  const full = avatarPath(fileName);
  if (!full) return null;
  try {
    return await fs.readFile(full);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteAvatarFile(fileName) {
  const full = avatarPath(fileName);
  if (!full) return;
  await fs.unlink(full).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
