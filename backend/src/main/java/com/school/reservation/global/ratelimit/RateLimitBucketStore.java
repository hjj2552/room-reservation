package com.school.reservation.global.ratelimit;

import io.github.bucket4j.Bucket;

public interface RateLimitBucketStore {

    Bucket resolveBucket(String clientIp, RateLimitPolicy policy);

    void clear();
}
