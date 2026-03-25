import { Injectable } from '@nestjs/common';
import { Observable, of } from 'rxjs'; // fix: 'of' imported from rxjs

@Injectable()
export class SimulationService {
  runSimulation(params: any): Observable<any> {
    return of({ status: 'simulated', params });
  }
}
