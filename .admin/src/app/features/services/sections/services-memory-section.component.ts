import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-services-memory-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule],
  template: `
    <div [formGroup]="group" class="grid two-col">
      <label class="field">
        <span class="label">Embedding model</span>
        <input pInputText formControlName="embeddingModel" placeholder="text-embedding-3-small" />
      </label>
      <label class="field">
        <span class="label">Embedding base URL</span>
        <input pInputText formControlName="embeddingBaseUrl" placeholder="https://api.openai.com/v1" />
      </label>
      <label class="field">
        <span class="label">Embedding API key</span>
        <input pInputText type="password" formControlName="embeddingApiKey" placeholder="sk-****" />
      </label>
      <label class="field">
        <span class="label">Index name</span>
        <input pInputText formControlName="indexName" placeholder="bernard_memories" />
      </label>
      <label class="field">
        <span class="label">Key prefix</span>
        <input pInputText formControlName="keyPrefix" placeholder="bernard:memories" />
      </label>
      <label class="field">
        <span class="label">Namespace</span>
        <input pInputText formControlName="namespace" placeholder="bernard:memories" />
      </label>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesMemorySectionComponent {
  @Input({ required: true }) group!: FormGroup;
}

