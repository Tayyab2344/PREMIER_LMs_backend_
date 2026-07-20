const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

const sdkKey = process.env.ZOOM_SDK_KEY || "h9WL1pqUTJo1UCkriPmIw";
const sdkSecret = process.env.ZOOM_SDK_SECRET || "uWULfx-YQuurORgUo7c4Ww";

const signJWT = (header, payload, secret) => {
    const base64UrlEncode = (obj) => {
      return Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

const meetingNumber = "1234567890";
const iat = Math.floor(Date.now() / 1000) - 30;
const exp = iat + 60 * 60 * 2;

const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
    appKey: sdkKey,
    sdkKey: sdkKey,
    mn: meetingNumber,
    role: 0,
    iat,
    exp,
    tokenExp: exp,
};

const sig = signJWT(header, payload, sdkSecret);
console.log("PAYLOAD:", JSON.stringify(payload, null, 2));
console.log("SIGNATURE:", sig);
