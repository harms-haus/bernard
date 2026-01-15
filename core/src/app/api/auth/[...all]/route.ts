import { auth } from "@/lib/auth/better-auth";
import { toNextJsHandler } from "better-auth/next-js";

export const GET = toNextJsHandler(auth);
export const POST = toNextJsHandler(auth);
