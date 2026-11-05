import { withUiSession } from "@/server/bff/routes";
import { hello } from "@/server/services/hello";

export const GET = withUiSession(hello);
