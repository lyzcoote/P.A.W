import { PORT, app} from "./src/api.ts";
import { LogManager } from "./shared/logger.ts"

const logger = new LogManager("P.A.W - MAIN", false);

async function main() {
    app.listen(PORT, () => {
        logger.success("Test server started successfully");
    });
}

main().catch((error) => {
    logger.fatal("Error starting the server:");
    logger.error(error);
});