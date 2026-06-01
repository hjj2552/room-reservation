import { FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/http';
import type { OperationSettings } from '../../shared/api/types';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useSettings, useUpdateSettings } from '../../shared/hooks/useSettings';
import { dayLabels } from '../../shared/utils/labels';

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function SettingsPage() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState<OperationSettings | null>(null);

  useEffect(() => {
    if (settings.data) {
      setForm({
        ...settings.data,
        openTime: settings.data.openTime.slice(0, 5),
        closeTime: settings.data.closeTime.slice(0, 5),
      });
    }
  }, [settings.data]);

  function updateField<K extends keyof OperationSettings>(key: K, value: OperationSettings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleDay(day: string) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        availableDaysOfWeek: prev.availableDaysOfWeek.includes(day)
          ? prev.availableDaysOfWeek.filter((item) => item !== day)
          : [...prev.availableDaysOfWeek, day],
      };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    updateSettings.mutate({
      ...form,
      publicNotice: form.publicNotice || null,
      reservationDisabledMessage: form.reservationDisabledMessage || null,
      adminContactName: form.adminContactName || null,
      adminContactEmail: form.adminContactEmail || null,
      adminContactPhone: form.adminContactPhone || null,
      completionMessage: form.completionMessage || null,
    });
  }

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError) return <ErrorState error={settings.error} />;
  if (!form) return null;

  return (
    <section className="page-section settings-page" aria-labelledby="settings-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">관리자 메뉴</p>
          <h1 id="settings-title">운영 설정</h1>
          <p className="muted">예약 가능 기간, 시간, 안내 문구를 관리합니다.</p>
        </div>
      </div>

      <form className="panel form-grid" data-testid="settings-form" onSubmit={handleSubmit}>
        <label>
          기관명
          <input
            data-testid="settings-organization-input"
            value={form.organizationName}
            onChange={(event) => updateField('organizationName', event.target.value)}
            required
          />
        </label>
        <label className="toggle-label settings-toggle">
          <input
            type="checkbox"
            checked={form.reservationEnabled}
            onChange={(event) => updateField('reservationEnabled', event.target.checked)}
          />
          공개 예약 접수 사용
        </label>
        <label className="full-span">
          공개 안내
          <textarea
            data-testid="settings-public-notice-input"
            rows={3}
            value={form.publicNotice || ''}
            onChange={(event) => updateField('publicNotice', event.target.value)}
          />
        </label>
        <label className="full-span">
          접수 중지 안내
          <textarea
            rows={2}
            value={form.reservationDisabledMessage || ''}
            onChange={(event) => updateField('reservationDisabledMessage', event.target.value)}
          />
        </label>
        <label>
          학기 시작일
          <input
            type="date"
            value={form.semesterStartDate}
            onChange={(event) => updateField('semesterStartDate', event.target.value)}
            required
          />
        </label>
        <label>
          학기 종료일
          <input
            type="date"
            value={form.semesterEndDate}
            onChange={(event) => updateField('semesterEndDate', event.target.value)}
            required
          />
        </label>
        <label>
          운영 시작 시간
          <input
            type="time"
            value={form.openTime}
            onChange={(event) => updateField('openTime', event.target.value)}
            required
          />
        </label>
        <label>
          운영 종료 시간
          <input
            type="time"
            value={form.closeTime}
            onChange={(event) => updateField('closeTime', event.target.value)}
            required
          />
        </label>
        <label>
          예약 단위(분)
          <select
            data-testid="settings-slot-minutes-select"
            value={form.slotMinutes}
            onChange={(event) => updateField('slotMinutes', Number(event.target.value))}
            required
          >
            {[5, 10, 15, 30, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}분
              </option>
            ))}
          </select>
        </label>
        <label>
          최소 예약 시간(분)
          <input
            type="number"
            min="1"
            value={form.minReservationMinutes}
            onChange={(event) => updateField('minReservationMinutes', Number(event.target.value))}
            required
          />
        </label>
        <label>
          최대 예약 시간(분)
          <input
            type="number"
            min="1"
            value={form.maxReservationMinutes}
            onChange={(event) => updateField('maxReservationMinutes', Number(event.target.value))}
            required
          />
        </label>
        <label className="toggle-label settings-toggle">
          <input
            type="checkbox"
            checked={form.requirePhone}
            onChange={(event) => updateField('requirePhone', event.target.checked)}
          />
          전화번호 필수 입력
        </label>
        <fieldset className="full-span checkbox-group">
          <legend>예약 가능 요일</legend>
          {days.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={form.availableDaysOfWeek.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {dayLabels[day]}
            </label>
          ))}
        </fieldset>
        <label>
          담당자 이름
          <input
            value={form.adminContactName || ''}
            onChange={(event) => updateField('adminContactName', event.target.value)}
          />
        </label>
        <label>
          담당자 이메일
          <input
            type="email"
            value={form.adminContactEmail || ''}
            onChange={(event) => updateField('adminContactEmail', event.target.value)}
          />
        </label>
        <label>
          담당자 전화번호
          <input
            value={form.adminContactPhone || ''}
            onChange={(event) => updateField('adminContactPhone', event.target.value)}
          />
        </label>
        <label className="full-span">
          예약 완료 안내
          <textarea
            rows={2}
            value={form.completionMessage || ''}
            onChange={(event) => updateField('completionMessage', event.target.value)}
          />
        </label>
        {updateSettings.isSuccess ? (
          <div className="success-box full-span" role="status">
            운영 설정을 저장했습니다.
          </div>
        ) : null}
        {updateSettings.isError ? (
          <div className="inline-error full-span" role="alert">{errorMessage(updateSettings.error)}</div>
        ) : null}
        <div className="button-row full-span settings-form-actions">
          <button
            type="submit"
            className="primary-button"
            data-testid="settings-save-button"
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </form>
    </section>
  );
}
