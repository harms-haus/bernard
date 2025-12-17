import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-services-backups-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule],
  template: `
    <div [formGroup]="group" class="grid two-col">
      <label class="field">
        <span class="label">Debounce seconds</span>
        <input pInputText type="number" formControlName="debounceSeconds" placeholder="60" />
      </label>
      <label class="field">
        <span class="label">Backup directory</span>
        <input pInputText type="text" formControlName="directory" placeholder="./backups" />
      </label>
      <label class="field">
        <span class="label">Retention days</span>
        <input pInputText type="number" formControlName="retentionDays" placeholder="14" />
      </label>
      <label class="field">
        <span class="label">Retention count</span>
        <input pInputText type="number" formControlName="retentionCount" placeholder="20" />
      </label>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesBackupsSectionComponent {
  @Input({ required: true }) group!: FormGroup;
}

