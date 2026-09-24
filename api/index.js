import { PrismaClient } from "@prisma/client";
import { createApp } from "../server/app.js";

// Reuse the client across warm function invocations.
const prisma = new PrismaClient();

export default createApp(prisma);
