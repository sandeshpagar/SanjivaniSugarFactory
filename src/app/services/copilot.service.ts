import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CopilotResponse } from '../models/farmer.model.js';

@Injectable({
  providedIn: 'root'
})
export class CopilotService {
  private http = inject(HttpClient);
  private apiUrl = '/api/copilot';

  askCopilot(question: string): Observable<CopilotResponse> {
    return this.http.post<CopilotResponse>(this.apiUrl, { question });
  }
}
