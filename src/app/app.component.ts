import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FarmerService } from './services/farmer.service.js';
import { CopilotService } from './services/copilot.service.js';
import { Farmer, Stats, WeighbridgeSlip } from './models/farmer.model.js';

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  toolInvocation?: {
    name: string;
    args: any;
    durationMs: number;
  };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  private farmerService = inject(FarmerService);
  private copilotService = inject(CopilotService);

  // State Signals
  farmers = signal<Farmer[]>([]);
  stats = signal<Stats | null>(null);
  weighbridgeSlips = signal<WeighbridgeSlip[]>([]);
  activeTab = signal<'ledger' | 'weighbridge' | 'settlement' | 'copilot'>('ledger');
  selectedVillage = signal<string>('all');
  searchQuery = signal<string>('');
  loadingChat = signal<boolean>(false);
  chatInput = signal<string>('');
  chatMessages = signal<ChatMessage[]>([
    {
      sender: 'ai',
      text: 'Namaskar! I am connected to the **Sanjivani Sugarcane Factory PostgreSQL database** through standard MCP tools. Ask me about farmer sugarcane tonnage, pending FRP payments, village yields, or weighbridge slips.',
      timestamp: 'Just now'
    }
  ]);

  // Computed Signals
  filteredFarmers = computed(() => {
    let list = this.farmers();
    const v = this.selectedVillage();
    const q = this.searchQuery().toLowerCase().trim();

    if (v !== 'all') {
      list = list.filter(f => f.village.toLowerCase() === v.toLowerCase());
    }

    if (q) {
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.village.toLowerCase().includes(q) ||
        `SNJ-2025-0${800 + f.id}`.toLowerCase().includes(q)
      );
    }

    return list;
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.farmerService.getFarmers().subscribe(res => this.farmers.set(res.farmers));
    this.farmerService.getStats().subscribe(s => this.stats.set(s));
    this.farmerService.getWeighbridgeSlips().subscribe(res => this.weighbridgeSlips.set(res.slips));
  }

  selectVillage(village: string) {
    this.selectedVillage.set(village);
  }

  switchTab(tab: 'ledger' | 'weighbridge' | 'settlement' | 'copilot') {
    this.activeTab.set(tab);
  }

  sendChat(promptText?: string) {
    const question = promptText || this.chatInput().trim();
    if (!question) return;

    this.chatInput.set('');
    this.chatMessages.update(msgs => [
      ...msgs,
      {
        sender: 'user',
        text: question,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    this.loadingChat.set(true);

    this.copilotService.askCopilot(question).subscribe({
      next: (res) => {
        this.loadingChat.set(false);
        this.chatMessages.update(msgs => [
          ...msgs,
          {
            sender: 'ai',
            text: res.answer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            toolInvocation: res.toolInvocation
          }
        ]);
      },
      error: (err) => {
        this.loadingChat.set(false);
        this.chatMessages.update(msgs => [
          ...msgs,
          {
            sender: 'ai',
            text: 'Error contacting MCP Copilot: ' + err.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    });
  }

  formatINR(val: number): string {
    return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
