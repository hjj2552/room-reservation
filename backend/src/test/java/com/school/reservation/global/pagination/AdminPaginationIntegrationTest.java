package com.school.reservation.global.pagination;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

class AdminPaginationIntegrationTest extends IntegrationTestSupport {

    private static final String[] LIST_ENDPOINTS = {
        "/api/admin/reservations",
        "/api/admin/recurrences",
        "/api/admin/rooms",
        "/api/admin/tags",
        "/api/admin/audit/reservation-histories"
    };

    @Test
    void adminListEndpointsClampOversizedPageSize() throws Exception {
        MockHttpSession session = loginAdminSession();

        for (String endpoint : LIST_ENDPOINTS) {
            mockMvc.perform(get(endpoint)
                    .session(session)
                    .param("size", "100000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100));
        }
    }

    @Test
    void adminListEndpointsRejectInvalidPageParameters() throws Exception {
        MockHttpSession session = loginAdminSession();

        for (String endpoint : LIST_ENDPOINTS) {
            assertValidationError(endpoint, session, "size", "0");
            assertValidationError(endpoint, session, "size", "-1");
            assertValidationError(endpoint, session, "page", "-1");
        }
    }

    @Test
    void adminListEndpointsUseDefaultAndRequestedPageSizes() throws Exception {
        MockHttpSession session = loginAdminSession();

        for (String endpoint : LIST_ENDPOINTS) {
            mockMvc.perform(get(endpoint).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20));

            mockMvc.perform(get(endpoint)
                    .session(session)
                    .param("page", "1")
                    .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(50));
        }
    }

    @Test
    void adminListEndpointsStillRequireAuthentication() throws Exception {
        for (String endpoint : LIST_ENDPOINTS) {
            mockMvc.perform(get(endpoint))
                .andExpect(status().isUnauthorized());
        }
    }

    private void assertValidationError(
        String endpoint,
        MockHttpSession session,
        String parameter,
        String value
    ) throws Exception {
        mockMvc.perform(get(endpoint)
                .session(session)
                .param(parameter, value))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
}
