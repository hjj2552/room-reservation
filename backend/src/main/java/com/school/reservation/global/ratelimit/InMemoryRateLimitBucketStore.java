package com.school.reservation.global.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

@Component
public class InMemoryRateLimitBucketStore implements RateLimitBucketStore {

    private final ConcurrentMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public Bucket resolveBucket(String clientIp, RateLimitPolicy policy) {
        return buckets.computeIfAbsent(key(clientIp, policy), ignored -> newBucket(policy));
    }

    @Override
    public void clear() {
        buckets.clear();
    }

    private Bucket newBucket(RateLimitPolicy policy) {
        Refill refill = Refill.intervally(policy.capacity(), policy.refillInterval());
        Bandwidth limit = Bandwidth.classic(policy.capacity(), refill);
        return Bucket.builder()
            .addLimit(limit)
            .build();
    }

    private String key(String clientIp, RateLimitPolicy policy) {
        return policy.name() + ":" + clientIp;
    }
}
