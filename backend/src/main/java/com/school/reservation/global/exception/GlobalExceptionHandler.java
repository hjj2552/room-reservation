package com.school.reservation.global.exception;

import com.school.reservation.domain.reservation.ReservationConflictService;
import com.school.reservation.domain.reservation.ReservationPolicyService;
import com.school.reservation.global.exception.dto.ApiErrorResponse;
import com.school.reservation.global.exception.dto.FieldErrorResponse;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ReservationConflictService.TimeSlotConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleConflict(
        ReservationConflictService.TimeSlotConflictException exception,
        HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiErrorResponse.of(
            "TIME_SLOT_CONFLICT",
            "The selected time slot is already reserved.",
            Map.of(
                "roomId", exception.getRoomId(),
                "startAt", exception.getStartAt(),
                "endAt", exception.getEndAt()
            ),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleDataIntegrityViolation(
        DataIntegrityViolationException exception,
        HttpServletRequest request
    ) {
        if (containsMessage(exception, "ex_reservations_no_time_overlap")) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiErrorResponse.of(
                "TIME_SLOT_CONFLICT",
                "The selected time slot is already reserved.",
                Map.of(),
                List.of(),
                request.getRequestURI()
            ));
        }

        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiErrorResponse.of(
            "DATA_INTEGRITY_VIOLATION",
            "The request violates a data constraint.",
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(ApiConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleApiConflict(ApiConflictException exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiErrorResponse.of(
            exception.getCode(),
            exception.getMessage(),
            exception.getDetails(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ApiErrorResponse> handleOptimisticLock(
        OptimisticLockingFailureException exception,
        HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiErrorResponse.of(
            "VERSION_CONFLICT",
            "The resource was updated by another request.",
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(ReservationPolicyService.PolicyViolationException.class)
    public ResponseEntity<ApiErrorResponse> handlePolicyViolation(
        ReservationPolicyService.PolicyViolationException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = "VALIDATION_ERROR".equals(exception.getCode())
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.UNPROCESSABLE_ENTITY;

        return ResponseEntity.status(status).body(ApiErrorResponse.of(
            exception.getCode(),
            exception.getMessage(),
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
        MethodArgumentNotValidException exception,
        HttpServletRequest request
    ) {
        List<FieldErrorResponse> fieldErrors = exception.getBindingResult().getFieldErrors().stream()
            .map(FieldErrorResponse::from)
            .toList();

        return ResponseEntity.badRequest().body(ApiErrorResponse.of(
            "VALIDATION_ERROR",
            "Please check the request fields.",
            Map.of(),
            fieldErrors,
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(
        IllegalArgumentException exception,
        HttpServletRequest request
    ) {
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(
            "VALIDATION_ERROR",
            exception.getMessage(),
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler({AuthenticationException.class, BadCredentialsException.class})
    public ResponseEntity<ApiErrorResponse> handleUnauthorized(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiErrorResponse.of(
            "ADMIN_UNAUTHORIZED",
            "Admin login is required.",
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
        EntityNotFoundException exception,
        HttpServletRequest request
    ) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiErrorResponse.of(
            "NOT_FOUND",
            exception.getMessage(),
            Map.of(),
            List.of(),
            request.getRequestURI()
        ));
    }

    private boolean containsMessage(Throwable throwable, String needle) {
        Throwable current = throwable;
        while (current != null) {
            if (current.getMessage() != null && current.getMessage().contains(needle)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
