import { withIntegrationToken } from "@/server/bff/routes";
import { hello } from "@/server/services/hello";

export const GET = withIntegrationToken(hello);
