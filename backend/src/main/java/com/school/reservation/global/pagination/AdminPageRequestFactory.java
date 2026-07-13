package com.school.reservation.global.pagination;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

public final class AdminPageRequestFactory {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    private AdminPageRequestFactory() {
    }

    public static PageRequest create(int page, int size, Sort sort) {
        if (page < 0) {
            throw new IllegalArgumentException("Page index must be zero or greater.");
        }
        if (size <= 0) {
            throw new IllegalArgumentException("Page size must be greater than zero.");
        }

        return PageRequest.of(page, Math.min(size, MAX_PAGE_SIZE), sort);
    }
}
