/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '../..');
const logoSize = 1024;
const samplesPerAxis = 4;
const colors = {
	background: [16, 24, 39, 255],
	border: [52, 70, 93, 255],
	teal: [56, 214, 197, 255],
	tealOrbit: [56, 214, 197, 140],
	gold: [244, 185, 66, 255],
	goldOrbit: [244, 185, 66, 210],
};

function insideRoundedRectangle(x, y, left, top, right, bottom, radius) {
	const halfWidth = (right - left) / 2;
	const halfHeight = (bottom - top) / 2;
	const cornerX = Math.max(Math.abs(x - (left + right) / 2) - halfWidth + radius, 0);
	const cornerY = Math.max(Math.abs(y - (top + bottom) / 2) - halfHeight + radius, 0);
	return cornerX * cornerX + cornerY * cornerY <= radius * radius;
}

function segmentDistance(x, y, start, end) {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	const lengthSquared = dx * dx + dy * dy;
	const projection = Math.max(0, Math.min(1, ((x - start[0]) * dx + (y - start[1]) * dy) / lengthSquared));
	return Math.hypot(x - start[0] - projection * dx, y - start[1] - projection * dy);
}

function onPolyline(x, y, points, width) {
	for (let index = 1; index < points.length; index++) {
		if (segmentDistance(x, y, points[index - 1], points[index]) <= width / 2) {
			return true;
		}
	}
	return false;
}

function onEllipse(x, y, rotation, width) {
	const radians = rotation * Math.PI / 180;
	const dx = x - logoSize / 2;
	const dy = y - logoSize / 2;
	const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
	const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
	const radius = Math.sqrt((localX * localX) / (390 * 390) + (localY * localY) / (235 * 235));
	return Math.abs(radius - 1) * 235 <= width / 2;
}

function colorAt(x, y) {
	if (!insideRoundedRectangle(x, y, 48, 48, 976, 976, 190)) {
		return [0, 0, 0, 0];
	}
	let color = colors.background;
	if (!insideRoundedRectangle(x, y, 67, 67, 957, 957, 171)) {
		color = colors.border;
	}
	if (onEllipse(x, y, -31, 15)) {
		color = colors.goldOrbit;
	}
	if (onEllipse(x, y, 57, 10)) {
		color = colors.tealOrbit;
	}
	if (Math.hypot(x - 795, y - 236) <= 23) {
		color = colors.gold;
	}
	if (onPolyline(x, y, [[306, 350], [430, 684], [554, 350]], 58)) {
		color = colors.teal;
	}
	if (onPolyline(x, y, [[756, 344], [713, 303], [661, 286], [614, 300], [586, 337], [584, 380], [606, 414], [647, 435], [693, 451], [725, 475], [739, 516], [729, 557], [698, 585], [655, 596], [612, 580], [585, 548]], 52)) {
		color = colors.gold;
	}
	return color;
}

function crc32(buffer) {
	let crc = 0xFFFFFFFF;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
		}
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(name, data) {
	const type = Buffer.from(name, 'ascii');
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
	return Buffer.concat([length, type, data, checksum]);
}

function renderPng(size) {
	const rowLength = size * 4 + 1;
	const pixels = Buffer.alloc(rowLength * size);
	for (let y = 0; y < size; y++) {
		const rowOffset = y * rowLength;
		pixels[rowOffset] = 0;
		for (let x = 0; x < size; x++) {
			const totals = [0, 0, 0, 0];
			for (let sampleY = 0; sampleY < samplesPerAxis; sampleY++) {
				for (let sampleX = 0; sampleX < samplesPerAxis; sampleX++) {
					const sample = colorAt((x + (sampleX + 0.5) / samplesPerAxis) * logoSize / size, (y + (sampleY + 0.5) / samplesPerAxis) * logoSize / size);
					for (let channel = 0; channel < 4; channel++) {
						totals[channel] += sample[channel];
					}
				}
			}
			const pixelOffset = rowOffset + 1 + x * 4;
			for (let channel = 0; channel < 4; channel++) {
				pixels[pixelOffset + channel] = Math.round(totals[channel] / (samplesPerAxis * samplesPerAxis));
			}
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk('IHDR', header),
		pngChunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
		pngChunk('IEND', Buffer.alloc(0)),
	]);
}

function makeIco(entries) {
	const directory = Buffer.alloc(6 + entries.length * 16);
	directory.writeUInt16LE(1, 2);
	directory.writeUInt16LE(entries.length, 4);
	let offset = directory.length;
	for (let index = 0; index < entries.length; index++) {
		const { size, png } = entries[index];
		const entryOffset = 6 + index * 16;
		directory[entryOffset] = size === 256 ? 0 : size;
		directory[entryOffset + 1] = size === 256 ? 0 : size;
		directory.writeUInt16LE(1, entryOffset + 4);
		directory.writeUInt16LE(32, entryOffset + 6);
		directory.writeUInt32LE(png.length, entryOffset + 8);
		directory.writeUInt32LE(offset, entryOffset + 12);
		offset += png.length;
	}
	return Buffer.concat([directory, ...entries.map(entry => entry.png)]);
}

function makeIcns(entries) {
	const chunks = entries.map(({ size, png }) => {
		const code = ({ 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' })[size];
		const header = Buffer.alloc(8);
		header.write(code, 0, 'ascii');
		header.writeUInt32BE(png.length + header.length, 4);
		return Buffer.concat([header, png]);
	});
	const header = Buffer.alloc(8);
	header.write('icns', 0, 'ascii');
	header.writeUInt32BE(header.length + chunks.reduce((length, chunk) => length + chunk.length, 0), 4);
	return Buffer.concat([header, ...chunks]);
}

const pngs = new Map();
for (const size of [16, 32, 48, 64, 70, 128, 150, 192, 256, 512, 1024]) {
	pngs.set(size, renderPng(size));
}

const write = (relativePath, data) => fs.writeFile(path.join(root, relativePath), data);
await Promise.all([
	write('resources/win32/code.ico', makeIco([16, 32, 48, 256].map(size => ({ size, png: pngs.get(size) })))),
	write('resources/win32/code_70x70.png', pngs.get(70)),
	write('resources/win32/code_150x150.png', pngs.get(150)),
	write('resources/darwin/code.icns', makeIcns([16, 32, 64, 128, 256, 512, 1024].map(size => ({ size, png: pngs.get(size) })))),
	write('resources/linux/code.png', pngs.get(256)),
	write('resources/server/vssodium-192.png', pngs.get(192)),
	write('resources/server/vssodium-512.png', pngs.get(512)),
	write('resources/server/favicon.ico', makeIco([16, 32, 48, 256].map(size => ({ size, png: pngs.get(size) })))),
	write('resources/vssodium/icon.png', pngs.get(1024)),
]);
