package com.school.reservation.global.pagination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

class AdminPageRequestFactoryTest {

    private static final Sort SORT = Sort.by(Sort.Direction.DESC, "createdAt");

    @Test
    void createsPageRequestWithRequestedPageAndAllowedSize() {
        assertPageRequest(AdminPageRequestFactory.create(0, 20, SORT), 0, 20);
        assertPageRequest(AdminPageRequestFactory.create(3, 50, SORT), 3, 50);
        assertPageRequest(AdminPageRequestFactory.create(0, 100, SORT), 0, 100);
    }

    @Test
    void clampsOversizedPageSize() {
        assertThat(AdminPageRequestFactory.create(0, 101, SORT).getPageSize()).isEqualTo(100);
        assertThat(AdminPageRequestFactory.create(0, 100_000, SORT).getPageSize()).isEqualTo(100);
    }

    @Test
    void rejectsNegativePageIndex() {
        assertThatThrownBy(() -> AdminPageRequestFactory.create(-1, 20, SORT))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Page index must be zero or greater.");
    }

    @Test
    void rejectsNonPositivePageSize() {
        assertThatThrownBy(() -> AdminPageRequestFactory.create(0, 0, SORT))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Page size must be greater than zero.");
        assertThatThrownBy(() -> AdminPageRequestFactory.create(0, -1, SORT))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Page size must be greater than zero.");
    }

    @Test
    void preservesSort() {
        assertThat(AdminPageRequestFactory.create(0, 20, SORT).getSort()).isEqualTo(SORT);
    }

    private void assertPageRequest(PageRequest pageRequest, int page, int size) {
        assertThat(pageRequest.getPageNumber()).isEqualTo(page);
        assertThat(pageRequest.getPageSize()).isEqualTo(size);
        assertThat(pageRequest.getSort()).isEqualTo(SORT);
    }
}
