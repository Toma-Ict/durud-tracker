// Gives the app the public half of the push key (the private half stays in Netlify's environment variables).
export default async () => Response.json({ key: process.env.VAPID_PUBLIC_KEY || "" });
export const config = { path: "/api/vapid" };
