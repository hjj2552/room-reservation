import { FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/http';
import type { OperationSettings } from '../../shared/api/types';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useSettings, useUpdateSettings } from '../../shared/hooks/useSettings';
import { dayLabels } from '../../shared/utils/labels';
import { operatingTimeOptions } from '../../shared/utils/timeOptions';
import { canonicalizeWeekdayCodes, toggleWeekday, WEEKDAY_ORDER } from '../../shared/utils/weekdays';

function timeMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function SettingsPage() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState<OperationSettings | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings.data) {
      setForm({
        ...settings.data,
        availableDaysOfWeek: canonicalizeWeekdayCodes(settings.data.availableDaysOfWeek),
        publicAvailableDaysOfWeek: canonicalizeWeekdayCodes(settings.data.publicAvailableDaysOfWeek),
        slotMinutes: 5,
        openTime: settings.data.openTime.slice(0, 5),
        closeTime: settings.data.closeTime.slice(0, 5),
        publicOpenTime: settings.data.publicOpenTime.slice(0, 5),
        publicCloseTime: settings.data.publicCloseTime.slice(0, 5),
      });
    }
  }, [settings.data]);

  function updateField<K extends keyof OperationSettings>(key: K, value: OperationSettings[K]) {
    setValidationErrors({});
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleDay(day: string) {
    setValidationErrors({});
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        availableDaysOfWeek: toggleWeekday(prev.availableDaysOfWeek, day),
      };
    });
  }

  function togglePublicDay(day: string) {
    setValidationErrors({});
    setForm((prev) => prev ? {
      ...prev,
      publicAvailableDaysOfWeek: toggleWeekday(prev.publicAvailableDaysOfWeek, day),
    } : prev);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const errors: Record<string, string> = {};
    if (form.publicOpenTime < form.openTime || form.publicCloseTime > form.closeTime || form.publicOpenTime >= form.publicCloseTime) {
      errors.publicTime = '일반 예약 시간은 운영 시간 안에서 시작 시간이 종료 시간보다 빨라야 합니다.';
    } else if (timeMinutes(form.publicCloseTime) - timeMinutes(form.publicOpenTime) < form.minReservationMinutes) {
      errors.publicTime = '일반 예약 시간 범위에 최소 예약 시간이 들어가야 합니다.';
    }
    if (form.availableDaysOfWeek.length === 0) {
      errors.operatingDays = '운영 요일을 하나 이상 선택해 주세요.';
    }
    if (form.publicAvailableDaysOfWeek.length === 0) {
      errors.publicDays = '일반 예약 가능 요일을 하나 이상 선택해 주세요.';
    } else if (form.publicAvailableDaysOfWeek.some((day) => !form.availableDaysOfWeek.includes(day))) {
      errors.publicDays = '일반 예약 가능 요일은 운영 요일에 포함되어야 합니다.';
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateSettings.mutate({
      ...form,
      availableDaysOfWeek: canonicalizeWeekdayCodes(form.availableDaysOfWeek),
      publicAvailableDaysOfWeek: canonicalizeWeekdayCodes(form.publicAvailableDaysOfWeek),
      slotMinutes: 5,
      publicNotice: form.publicNotice || null,
      reservationDisabledMessage: form.reservationDisabledMessage || null,
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
        <div className="settings-field-pair full-span" data-testid="settings-semester-pair">
          <label>
            예약 가능 시작일
            <input
              type="date"
              value={form.semesterStartDate}
              onChange={(event) => updateField('semesterStartDate', event.target.value)}
              required
            />
          </label>
          <label>
            예약 가능 종료일
            <input
              type="date"
              value={form.semesterEndDate}
              onChange={(event) => updateField('semesterEndDate', event.target.value)}
              required
            />
          </label>
        </div>
        <div className="settings-field-pair full-span" data-testid="settings-hours-pair">
          <label>
            운영 시작 시간
            <select
              data-testid="settings-open-time-input"
              value={form.openTime}
              onChange={(event) => updateField('openTime', event.target.value)}
              required
            >
              {operatingTimeOptions().map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            운영 종료 시간
            <select
              data-testid="settings-close-time-input"
              value={form.closeTime}
              onChange={(event) => updateField('closeTime', event.target.value)}
              required
            >
              {operatingTimeOptions().map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-field-pair full-span" data-testid="settings-public-hours-pair">
          <label>
            일반 예약 시작 시간
            <select
              data-testid="settings-public-open-time-input"
              value={form.publicOpenTime}
              onChange={(event) => updateField('publicOpenTime', event.target.value)}
              required
            >
              {operatingTimeOptions().map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            일반 예약 종료 시간
            <select
              data-testid="settings-public-close-time-input"
              value={form.publicCloseTime}
              onChange={(event) => updateField('publicCloseTime', event.target.value)}
              required
            >
              {operatingTimeOptions().map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        {validationErrors.publicTime ? (
          <div className="field-error full-span" role="alert">{validationErrors.publicTime}</div>
        ) : null}
        <div className="settings-field-pair full-span" data-testid="settings-duration-pair">
          <label>
            최소 예약 시간(분)
            <input
              type="number"
              min={30}
              step={5}
              data-testid="settings-min-reservation-input"
              value={form.minReservationMinutes}
              onChange={(event) => updateField('minReservationMinutes', Number(event.target.value))}
              required
            />
          </label>
          <label>
            최대 예약 시간(분)
            <input
              type="number"
              min={form.minReservationMinutes}
              step={5}
              data-testid="settings-max-reservation-input"
              value={form.maxReservationMinutes}
              onChange={(event) => updateField('maxReservationMinutes', Number(event.target.value))}
              required
            />
          </label>
        </div>
        <p className="compact-note muted full-span">
          최소·최대 예약 시간을 5(분)의 배수로 입력해 주세요. 최소 예약 시간은 30분 이상이어야 합니다.
        </p>
        <fieldset className="full-span checkbox-group">
          <legend>운영 요일</legend>
          {WEEKDAY_ORDER.map((day) => (
            <label key={day}>
              <input
                data-testid={`settings-day-${day}`}
                type="checkbox"
                checked={form.availableDaysOfWeek.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {dayLabels[day]}
            </label>
          ))}
        </fieldset>
        {validationErrors.operatingDays ? (
          <div className="field-error full-span" role="alert">{validationErrors.operatingDays}</div>
        ) : null}
        <fieldset className="full-span checkbox-group">
          <legend>일반 예약 가능 요일</legend>
          {WEEKDAY_ORDER.map((day) => (
            <label key={day}>
              <input
                data-testid={`settings-public-day-${day}`}
                type="checkbox"
                checked={form.publicAvailableDaysOfWeek.includes(day)}
                onChange={() => togglePublicDay(day)}
              />
              {dayLabels[day]}
            </label>
          ))}
        </fieldset>
        {validationErrors.publicDays ? (
          <div className="field-error full-span" role="alert">{validationErrors.publicDays}</div>
        ) : null}
        <label>
          문의 이메일
          <input
            type="email"
            value={form.adminContactEmail || ''}
            onChange={(event) => updateField('adminContactEmail', event.target.value)}
          />
        </label>
        <label>
          문의 전화번호
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
