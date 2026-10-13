import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Farmer, Stats, WeighbridgeSlip } from '../models/farmer.model.js';

@Injectable({
  providedIn: 'root'
})
export class FarmerService {
  private http = inject(HttpClient);
  private apiUrl = '/api';

  getFarmers(village?: string, search?: string): Observable<{ farmers: Farmer[] }> {
    let params: any = {};
    if (village && village !== 'all') params.village = village;
    if (search) params.q = search;
    return this.http.get<{ farmers: Farmer[] }>(`${this.apiUrl}/farmers`, { params });
  }

  getStats(): Observable<Stats> {
    return this.http.get<Stats>(`${this.apiUrl}/stats`);
  }

  getWeighbridgeSlips(): Observable<{ slips: WeighbridgeSlip[] }> {
    return this.http.get<{ slips: WeighbridgeSlip[] }>(`${this.apiUrl}/weighbridge`);
  }
}
