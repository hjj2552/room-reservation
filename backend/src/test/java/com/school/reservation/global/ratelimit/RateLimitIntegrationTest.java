package com.school.reservation.global.ratelimit;

import com.school.reservation.support.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RateLimitIntegrationTest extends IntegrationTestSupport {

    @Test
    void readEndpointReturnsTooManyRequestsAfterLimitExceeded() throws Exception {
        String clientIp = "192.0.2.10";

        for (int i = 0; i < 120; i++) {
            mockMvc.perform(get("/api/public/settings")
                    .header("X-Forwarded-For", clientIp))
                .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/public/settings")
                .header("X-Forwarded-For", clientIp))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"))
            .andExpect(jsonPath("$.details.retryAfterSeconds").isNumber());
    }

    @Test
    void writeEndpointReturnsTooManyRequestsAfterLimitExceeded() throws Exception {
        UUID roomId = testRoomId();
        String clientIp = "192.0.2.20";

        for (int i = 0; i < 24; i++) {
            mockMvc.perform(post("/api/public/reservations")
                    .header("X-Forwarded-For", clientIp)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(publicReservationPayload(roomId)))
                .andExpect(status().is(not(429)));
        }

        mockMvc.perform(post("/api/public/reservations")
                .header("X-Forwarded-For", clientIp)
                .contentType(MediaType.APPLICATION_JSON)
                .content(publicReservationPayload(roomId)))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));
    }

    @Test
    void authenticatedAdminBypassesRateLimit() throws Exception {
        MockHttpSession session = loginAdminSession();
        String clientIp = "192.0.2.30";

        for (int i = 0; i < 130; i++) {
            mockMvc.perform(get("/api/admin/settings")
                    .session(session)
                    .header("X-Forwarded-For", clientIp))
                .andExpect(status().isOk());
        }
    }

    @Test
    void unauthenticatedAdminPathUsesIpRateLimit() throws Exception {
        String clientIp = "192.0.2.40";

        for (int i = 0; i < 120; i++) {
            mockMvc.perform(get("/api/admin/settings")
                    .header("X-Forwarded-For", clientIp))
                .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(get("/api/admin/settings")
                .header("X-Forwarded-For", clientIp))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("RATE_LIMIT_EXCEEDED"));
    }

    private String publicReservationPayload(UUID roomId) {
        return """
            {
              "roomId": "%s",
              "applicantName": "Rate Limit Public",
              "applicantEmail": "rate-limit@example.test",
              "applicantPhone": "010-1000-2000",
              "purpose": "rate limit integration test",
              "startAt": "%s",
              "endAt": "%s",
              "cancelPassword": "rate-limit-password"
            }
            """.formatted(roomId, nextWeekdayAt(13, 0), nextWeekdayAt(14, 0));
    }
}
