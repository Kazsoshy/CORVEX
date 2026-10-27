import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { avatarContentType, detectAvatarImage } from './avatars.js';

const PRODUCT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads', 'products');
const EXTENSIONS = ['jpg', 'png', 'webp'];
const FILE_NAME = /^[1-9]\d{0,9}\.(jpg|png|webp)$/;

function productId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function imagePath(fileName) {
  if (!FILE_NAME.test(String(fileName || ''))) return null;
  const full = path.resolve(PRODUCT_DIR, fileName);
  const root = path.resolve(PRODUCT_DIR);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}

export function detectProductImage(buffer) {
  return detectAvatarImage(buffer);
}

export function productImageUrl(id) {
  return `/api/products/${id}/image?v=${Date.now()}`;
}

export async function saveProductImage(id, buffer, ext) {
  const product = productId(id);
  if (!product) throw new Error('Invalid product.');
  if (!EXTENSIONS.includes(ext)) throw new Error('Invalid image type.');
  await fs.mkdir(PRODUCT_DIR, { recursive: true });
  const name = `${product}.${ext}`;
  const destination = imagePath(name);
  if (!destination) throw new Error('Invalid image name.');
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, buffer);
  await fs.rm(destination, { force: true });
  await fs.rename(temporary, destination);
  await Promise.all(EXTENSIONS.filter((item) => item !== ext).map((item) => (
    fs.unlink(path.join(PRODUCT_DIR, `${product}.${item}`)).catch(() => {})
  )));
  return name;
}

export async function loadProductImage(id) {
  const product = productId(id);
  if (!product) return null;
  for (const ext of EXTENSIONS) {
    const name = `${product}.${ext}`;
    const full = imagePath(name);
    if (!full) continue;
    try {
      const buffer = await fs.readFile(full);
      return { buffer, mime: avatarContentType(name) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function deleteProductImage(id) {
  const product = productId(id);
  if (!product) return;
  await Promise.all(EXTENSIONS.map((ext) => {
    const full = imagePath(`${product}.${ext}`);
    if (!full) return Promise.resolve();
    return fs.unlink(full).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }));
}
