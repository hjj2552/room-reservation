import { FormEvent, useEffect, useState } from 'react';
import { errorMessage } from '../../shared/api/http';
import type { OperationSettings } from '../../shared/api/types';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useSettings, useUpdateSettings } from '../../shared/hooks/useSettings';
import { dayLabels } from '../../shared/utils/labels';
import { operatingTimeOptions } from '../../shared/utils/timeOptions';
import { canonicalizeWeekdayCodes, toggleWeekday, WEEKDAY_ORDER } from '../../shared/utils/weekdays';

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
        specialApprovalDaysOfWeek: canonicalizeWeekdayCodes(settings.data.specialApprovalDaysOfWeek),
        slotMinutes: 5,
        openTime: settings.data.openTime.slice(0, 5),
        closeTime: settings.data.closeTime.slice(0, 5),
        specialApprovalStartTime: settings.data.specialApprovalStartTime.slice(0, 5),
        specialApprovalEndTime: settings.data.specialApprovalEndTime.slice(0, 5),
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

  function toggleSpecialApprovalDay(day: string) {
    setValidationErrors({});
    setForm((prev) => prev ? {
      ...prev,
      specialApprovalDaysOfWeek: toggleWeekday(prev.specialApprovalDaysOfWeek, day),
    } : prev);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const errors: Record<string, string> = {};
    if (form.specialApprovalStartTime < form.openTime || form.specialApprovalEndTime > form.closeTime || form.specialApprovalStartTime >= form.specialApprovalEndTime) {
      errors.specialApprovalTime = '특별 허가 시간은 운영 시간 안에서 시작 시간이 종료 시간보다 빨라야 합니다.';
    }
    if (form.availableDaysOfWeek.length === 0) {
      errors.operatingDays = '운영 요일을 하나 이상 선택해 주세요.';
    }
    if (form.specialApprovalDaysOfWeek.some((day) => !form.availableDaysOfWeek.includes(day))) {
      errors.specialApprovalDays = '특별 허가 요일은 운영 요일에 포함되어야 합니다.';
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateSettings.mutate({
      ...form,
      availableDaysOfWeek: canonicalizeWeekdayCodes(form.availableDaysOfWeek),
      specialApprovalDaysOfWeek: canonicalizeWeekdayCodes(form.specialApprovalDaysOfWeek),
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
        <div className="settings-field-pair full-span" data-testid="settings-special-approval-hours-pair">
          <label>
            특별 허가 시작 시간
            <select
              data-testid="settings-special-approval-start-time-input"
              value={form.specialApprovalStartTime}
              onChange={(event) => updateField('specialApprovalStartTime', event.target.value)}
              required
            >
              {operatingTimeOptions().filter((option) => option.value >= form.openTime && option.value < form.closeTime).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            특별 허가 종료 시간
            <select
              data-testid="settings-special-approval-end-time-input"
              value={form.specialApprovalEndTime}
              onChange={(event) => updateField('specialApprovalEndTime', event.target.value)}
              required
            >
              {operatingTimeOptions().filter((option) => option.value > form.openTime && option.value <= form.closeTime).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        {validationErrors.specialApprovalTime ? (
          <div className="field-error full-span" role="alert">{validationErrors.specialApprovalTime}</div>
        ) : null}
        <p className="compact-note muted full-span">
          특별 허가 시간 또는 요일과 겹치는 예약은 관리자가 승인할 때 확인 안내가 표시됩니다. 공개 사용자는 전체 운영시간에 예약을 신청할 수 있습니다.
        </p>
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
          <legend>특별 허가 요일</legend>
          {WEEKDAY_ORDER.map((day) => (
            <label key={day}>
              <input
                data-testid={`settings-special-approval-day-${day}`}
                type="checkbox"
                checked={form.specialApprovalDaysOfWeek.includes(day)}
                onChange={() => toggleSpecialApprovalDay(day)}
              />
              {dayLabels[day]}
            </label>
          ))}
        </fieldset>
        {validationErrors.specialApprovalDays ? (
          <div className="field-error full-span" role="alert">{validationErrors.specialApprovalDays}</div>
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
