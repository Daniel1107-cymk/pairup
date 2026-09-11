import { createHash } from "node:crypto";

/** Cookie value proving the passphrase was entered; the raw secret never leaves the server. */
export const token = () => createHash("sha256").update(process.env.PASSPHRASE!).digest("hex");
