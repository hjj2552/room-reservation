package com.school.reservation.global.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record PagedResponse<T>(
    List<T> items,
    int page,
    int size,
    long totalItems,
    int totalPages
) {
    public static <T> PagedResponse<T> from(Page<T> page) {
        return new PagedResponse<>(
            page.getContent(),
            page.getNumber(),
            page.getSize(),
            page.getTotalElements(),
            page.getTotalPages()
        );
    }
}

