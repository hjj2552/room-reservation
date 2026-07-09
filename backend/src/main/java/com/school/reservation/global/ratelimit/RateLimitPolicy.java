package com.school.reservation.global.ratelimit;

import java.time.Duration;

public enum RateLimitPolicy {
    READ(120, Duration.ofMinutes(1)),
    WRITE(24, Duration.ofMinutes(1));

    private final long capacity;
    private final Duration refillInterval;

    RateLimitPolicy(long capacity, Duration refillInterval) {
        this.capacity = capacity;
        this.refillInterval = refillInterval;
    }

    public long capacity() {
        return capacity;
    }

    public Duration refillInterval() {
        return refillInterval;
    }
}
