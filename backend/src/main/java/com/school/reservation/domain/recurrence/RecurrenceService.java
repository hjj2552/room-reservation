package com.school.reservation.domain.recurrence;

import com.school.reservation.domain.recurrence.dto.request.CreateRecurrenceRequest;
import com.school.reservation.domain.recurrence.dto.request.PreviewRecurrenceRequest;
import com.school.reservation.domain.recurrence.dto.response.CreateRecurrenceResponse;
import com.school.reservation.domain.recurrence.dto.response.PreviewRecurrenceResponse;
import com.school.reservation.domain.recurrence.dto.response.RecurrenceReservationResponse;
import com.school.reservation.domain.reservation.Reservation;
import com.school.reservation.domain.reservation.ReservationConflictService;
import com.school.reservation.domain.reservation.ReservationHistory;
import com.school.reservation.domain.reservation.ReservationHistoryRepository;
import com.school.reservation.domain.reservation.ReservationPolicyService;
import com.school.reservation.domain.reservation.ReservationRepository;
import com.school.reservation.domain.reservation.ReservationService;
import com.school.reservation.domain.room.Room;
import com.school.reservation.domain.room.RoomRepository;
import com.school.reservation.global.exception.ApiConflictException;
import jakarta.persistence.EntityNotFoundException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecurrenceService {

    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    private final RoomRepository roomRepository;
    private final ReservationService reservationService;
    private final ReservationConflictService conflictService;
    private final ReservationPolicyService policyService;
    private final ReservationRecurrenceRepository recurrenceRepository;
    private final ReservationRepository reservationRepository;
    private final ReservationHistoryRepository historyRepository;

    public RecurrenceService(
        RoomRepository roomRepository,
        ReservationService reservationService,
        ReservationConflictService conflictService,
        ReservationPolicyService policyService,
        ReservationRecurrenceRepository recurrenceRepository,
        ReservationRepository reservationRepository,
        ReservationHistoryRepository historyRepository
    ) {
        this.roomRepository = roomRepository;
        this.reservationService = reservationService;
        this.conflictService = conflictService;
        this.policyService = policyService;
        this.recurrenceRepository = recurrenceRepository;
        this.reservationRepository = reservationRepository;
        this.historyRepository = historyRepository;
    }

    @Transactional(readOnly = true)
    public PreviewRecurrenceResponse preview(PreviewRecurrenceRequest request) {
        Room room = getRoom(request.roomId());
        List<PreviewRecurrenceResponse.Item> items = candidates(request).stream()
            .map(candidate -> previewItem(room, candidate, request.applicantPhone()))
            .toList();
        return PreviewRecurrenceResponse.from(request.conflictPolicy(), items);
    }

    @Transactional
    public CreateRecurrenceResponse create(CreateRecurrenceRequest request, String adminId) {
        Room room = getRoom(request.roomId());
        List<Candidate> candidates = candidates(request.toPreviewRequest());
        List<PreviewRecurrenceResponse.Item> previewItems = candidates.stream()
            .map(candidate -> previewItem(room, candidate, request.applicantPhone()))
            .toList();

        if (request.conflictPolicy() == ReservationRecurrence.ConflictPolicy.FAIL_ALL
            && previewItems.stream().anyMatch(item -> !item.available())) {
            throw new ApiConflictException(
                "RECURRENCE_CONFLICT",
                "One or more recurrence slots cannot be created.",
                Map.of("failedCount", previewItems.stream().filter(item -> !item.available()).count())
            );
        }

        ReservationRecurrence recurrence = recurrenceRepository.save(new ReservationRecurrence(
            room,
            request.applicantName(),
            request.applicantEmail(),
            request.applicantPhone(),
            request.purpose(),
            request.seriesLabel(),
            request.seriesColor(),
            request.startDate(),
            request.endDate(),
            normalizeDays(request.daysOfWeek()),
            request.startTime(),
            request.endTime(),
            request.conflictPolicy(),
            null
        ));

        List<CreateRecurrenceResponse.Item> resultItems = new ArrayList<>();
        int createdCount = 0;
        int skippedCount = 0;
        for (int index = 0; index < candidates.size(); index++) {
            Candidate candidate = candidates.get(index);
            PreviewRecurrenceResponse.Item previewItem = previewItems.get(index);
            if (!previewItem.available()) {
                skippedCount++;
                resultItems.add(new CreateRecurrenceResponse.Item(candidate.date(), "SKIPPED", previewItem.reason()));
                continue;
            }

            reservationService.createRecurringReservation(
                new ReservationService.CreateReservationCommand(
                    request.roomId(),
                    request.applicantName(),
                    request.applicantEmail(),
                    request.applicantPhone(),
                    request.purpose(),
                    candidate.startAt(),
                    candidate.endAt(),
                    Reservation.ReservationStatus.CONFIRMED,
                    Reservation.ReservationSource.RECURRING_GENERATED
                ),
                adminId,
                recurrence
            );
            createdCount++;
            resultItems.add(new CreateRecurrenceResponse.Item(candidate.date(), "CREATED", null));
        }

        return new CreateRecurrenceResponse(
            recurrence.getId(),
            recurrence.getSeriesLabel(),
            recurrence.getSeriesColor(),
            request.conflictPolicy(),
            candidates.size(),
            createdCount,
            skippedCount,
            0,
            resultItems
        );
    }

    @Transactional(readOnly = true)
    public Page<ReservationRecurrence> search(boolean includeDeleted, Pageable pageable) {
        return recurrenceRepository.findRecurrences(includeDeleted, pageable);
    }

    @Transactional(readOnly = true)
    public ReservationRecurrence getDetail(UUID recurrenceId) {
        return recurrenceRepository.findDetailById(recurrenceId)
            .orElseThrow(() -> new EntityNotFoundException("Recurrence not found."));
    }

    @Transactional(readOnly = true)
    public List<RecurrenceReservationResponse> getReservations(UUID recurrenceId) {
        return reservationRepository.findByRecurrenceIdOrderByStartAt(recurrenceId).stream()
            .map(RecurrenceReservationResponse::from)
            .toList();
    }

    @Transactional
    public void cancel(UUID recurrenceId, String adminId, String memo) {
        ReservationRecurrence recurrence = getDetail(recurrenceId);
        recurrence.softDelete(null);

        List<Reservation> reservations = reservationRepository.findActiveReservationsByRecurrenceId(
            recurrenceId,
            List.of(Reservation.ReservationStatus.REQUESTED, Reservation.ReservationStatus.CONFIRMED)
        );
        for (Reservation reservation : reservations) {
            Reservation.ReservationStatus beforeStatus = reservation.getStatus();
            reservation.cancel(Reservation.ActorType.ADMIN, adminId);
            historyRepository.save(new ReservationHistory(
                reservation,
                ReservationHistory.Action.RECURRENCE_CANCELLED,
                beforeStatus,
                reservation.getStatus(),
                memo,
                Reservation.ActorType.ADMIN,
                adminId
            ));
        }
    }

    private PreviewRecurrenceResponse.Item previewItem(Room room, Candidate candidate, String applicantPhone) {
        try {
            policyService.validate(room, candidate.startAt(), candidate.endAt(), applicantPhone);
            if (conflictService.existsConflict(room.getId(), candidate.startAt(), candidate.endAt(), null)) {
                return new PreviewRecurrenceResponse.Item(
                    candidate.date(),
                    candidate.startAt(),
                    candidate.endAt(),
                    false,
                    "TIME_SLOT_CONFLICT",
                    "Time slot is already reserved."
                );
            }
            return new PreviewRecurrenceResponse.Item(
                candidate.date(),
                candidate.startAt(),
                candidate.endAt(),
                true,
                null,
                null
            );
        } catch (ReservationPolicyService.PolicyViolationException exception) {
            return new PreviewRecurrenceResponse.Item(
                candidate.date(),
                candidate.startAt(),
                candidate.endAt(),
                false,
                exception.getCode(),
                exception.getMessage()
            );
        }
    }

    private Room getRoom(UUID roomId) {
        return roomRepository.findByIdAndDeletedAtIsNull(roomId)
            .orElseThrow(() -> new EntityNotFoundException("Room not found."));
    }

    private List<Candidate> candidates(PreviewRecurrenceRequest request) {
        if (request.startDate().isAfter(request.endDate())) {
            throw new IllegalArgumentException("Start date must be before or equal to end date.");
        }
        Set<String> days = request.daysOfWeek().stream()
            .map(this::normalizeDay)
            .collect(Collectors.toSet());
        List<Candidate> candidates = new ArrayList<>();
        LocalDate date = request.startDate();
        while (!date.isAfter(request.endDate())) {
            String day = date.getDayOfWeek().name().substring(0, 3);
            if (days.contains(day)) {
                candidates.add(new Candidate(
                    date,
                    OffsetDateTime.of(date, request.startTime(), SERVICE_ZONE.getRules().getOffset(date.atStartOfDay())),
                    OffsetDateTime.of(date, request.endTime(), SERVICE_ZONE.getRules().getOffset(date.atStartOfDay()))
                ));
            }
            date = date.plusDays(1);
        }
        return candidates;
    }

    private String normalizeDays(List<String> daysOfWeek) {
        return daysOfWeek.stream()
            .map(this::normalizeDay)
            .distinct()
            .collect(Collectors.joining(","));
    }

    private String normalizeDay(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Day of week is required.");
        }
        String normalized = value.trim().toUpperCase();
        if (normalized.length() > 3) {
            normalized = normalized.substring(0, 3);
        }
        if (!Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN").contains(normalized)) {
            throw new IllegalArgumentException("Invalid day of week: " + value);
        }
        return normalized;
    }

    private record Candidate(LocalDate date, OffsetDateTime startAt, OffsetDateTime endAt) {
    }
}
