/** Entry point of the asset pack worker. The page starts it in kit-files.ts. */
import { servePack } from "./pack-service.ts"

servePack(self)
