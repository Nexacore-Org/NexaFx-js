import { SetMetadata } from "@nestjs/common";

export const TRANSACTIONAL_KEY = "transactional";
export const Transactional = () => SetMetadata(TRANSACTIONAL_KEY, true);
