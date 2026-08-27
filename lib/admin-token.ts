import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function adminSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Configure SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY.");
  return secret;
}

function signature(value:string) {
  return createHmac("sha256",adminSecret()).update(value).digest("hex");
}

export function createAdminActionToken(userId:string) {
  const expiresAt=Math.floor(Date.now()/1000)+TOKEN_LIFETIME_SECONDS;
  const payload=`${userId}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminActionToken(token:string) {
  const [userId,expiresText,providedSignature,...extra]=token.split(".");
  if(!userId||!expiresText||!providedSignature||extra.length)return null;
  const expiresAt=Number(expiresText);
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=Math.floor(Date.now()/1000))return null;
  const payload=`${userId}.${expiresAt}`;
  const expected=Buffer.from(signature(payload),"hex");
  const provided=Buffer.from(providedSignature,"hex");
  if(expected.length!==provided.length||!timingSafeEqual(expected,provided))return null;
  return {userId,expiresAt};
}

export function getAdminSupabaseKey() {
  return adminSecret();
}
