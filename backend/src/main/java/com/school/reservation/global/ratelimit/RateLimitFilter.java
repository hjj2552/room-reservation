package com.school.reservation.global.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.global.exception.dto.ApiErrorResponse;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final String FORWARDED_FOR = "X-Forwarded-For";
    private static final String ADMIN_ROLE = "ROLE_ADMIN";
    private static final long NANOS_PER_SECOND = 1_000_000_000L;

    private final RateLimitBucketStore bucketStore;
    private final ObjectMapper objectMapper;

    public RateLimitFilter(RateLimitBucketStore bucketStore, ObjectMapper objectMapper) {
        this.bucketStore = bucketStore;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        if (isAuthenticatedAdmin()) {
            filterChain.doFilter(request, response);
            return;
        }

        RateLimitPolicy policy = policyFor(request);
        Bucket bucket = bucketStore.resolveBucket(clientIp(request), policy);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            response.setHeader("X-RateLimit-Limit", String.valueOf(policy.capacity()));
            response.setHeader("X-RateLimit-Remaining", String.valueOf(probe.getRemainingTokens()));
            filterChain.doFilter(request, response);
            return;
        }

        long retryAfterSeconds = retryAfterSeconds(probe);
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiErrorResponse.of(
            "RATE_LIMIT_EXCEEDED",
            "Too many requests. Please retry later.",
            Map.of("retryAfterSeconds", retryAfterSeconds),
            List.of(),
            request.getRequestURI()
        ));
    }

    private RateLimitPolicy policyFor(HttpServletRequest request) {
        if ("GET".equalsIgnoreCase(request.getMethod())) {
            return RateLimitPolicy.READ;
        }
        return RateLimitPolicy.WRITE;
    }

    private String clientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader(FORWARDED_FOR);
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",", 2)[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isAuthenticatedAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
            || !authentication.isAuthenticated()
            || authentication instanceof AnonymousAuthenticationToken) {
            return false;
        }
        return authentication.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .anyMatch(ADMIN_ROLE::equals);
    }

    private long retryAfterSeconds(ConsumptionProbe probe) {
        long nanosToWait = probe.getNanosToWaitForRefill();
        return Math.max(1, (nanosToWait + NANOS_PER_SECOND - 1) / NANOS_PER_SECOND);
    }
}
