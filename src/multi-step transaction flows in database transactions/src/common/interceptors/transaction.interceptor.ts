import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { Reflector } from "@nestjs/core";
import { TRANSACTIONAL_KEY } from "../decorators/transactional.decorator";

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const isTransactional = this.reflector.get<boolean>(
      TRANSACTIONAL_KEY,
      context.getHandler(),
    );

    if (!isTransactional) {
      return next.handle();
    }

    // Transaction handling is done in the service layer
    return next.handle();
  }
}
