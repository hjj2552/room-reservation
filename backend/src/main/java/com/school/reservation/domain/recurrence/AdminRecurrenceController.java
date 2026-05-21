package com.school.reservation.domain.recurrence;

import com.school.reservation.domain.recurrence.dto.request.CancelRecurrenceRequest;
import com.school.reservation.domain.recurrence.dto.request.CreateRecurrenceRequest;
import com.school.reservation.domain.recurrence.dto.request.PreviewRecurrenceRequest;
import com.school.reservation.domain.recurrence.dto.response.CreateRecurrenceResponse;
import com.school.reservation.domain.recurrence.dto.response.PreviewRecurrenceResponse;
import com.school.reservation.domain.recurrence.dto.response.RecurrenceDetailResponse;
import com.school.reservation.domain.recurrence.dto.response.RecurrenceListItemResponse;
import com.school.reservation.global.dto.PagedResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/recurrences")
public class AdminRecurrenceController {

    private final RecurrenceService recurrenceService;

    public AdminRecurrenceController(RecurrenceService recurrenceService) {
        this.recurrenceService = recurrenceService;
    }

    @PostMapping("/preview")
    public PreviewRecurrenceResponse preview(@Valid @RequestBody PreviewRecurrenceRequest request) {
        return recurrenceService.preview(request);
    }

    @PostMapping
    public ResponseEntity<CreateRecurrenceResponse> create(
        @Valid @RequestBody CreateRecurrenceRequest request,
        Authentication authentication
    ) {
        CreateRecurrenceResponse response = recurrenceService.create(request, authentication.getName());
        return ResponseEntity.created(URI.create("/api/admin/recurrences/" + response.recurrenceId()))
            .body(response);
    }

    @GetMapping
    public PagedResponse<RecurrenceListItemResponse> getRecurrences(
        @RequestParam(defaultValue = "false") boolean includeDeleted,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return PagedResponse.from(recurrenceService
            .search(includeDeleted, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")))
            .map(RecurrenceListItemResponse::from));
    }

    @GetMapping("/{recurrenceId}")
    public RecurrenceDetailResponse getDetail(@PathVariable UUID recurrenceId) {
        return RecurrenceDetailResponse.from(recurrenceService.getDetail(recurrenceId));
    }

    @PostMapping("/{recurrenceId}/cancel")
    public ResponseEntity<Void> cancel(
        @PathVariable UUID recurrenceId,
        @Valid @RequestBody(required = false) CancelRecurrenceRequest request,
        Authentication authentication
    ) {
        String memo = request == null ? null : request.memo();
        recurrenceService.cancel(recurrenceId, authentication.getName(), memo);
        return ResponseEntity.noContent().build();
    }
}
