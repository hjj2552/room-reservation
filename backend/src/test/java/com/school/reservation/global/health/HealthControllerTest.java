package com.school.reservation.global.health;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        useDefaultFilters = false,
        includeFilters = @ComponentScan.Filter(
                type = FilterType.REGEX,
                pattern = {
                    "com\\.school\\.reservation\\.global\\.health\\.HealthController",
                    "com\\.school\\.reservation\\.global\\.security\\.SecurityConfig",
                    "com\\.school\\.reservation\\.global\\.ratelimit\\.RateLimitFilter",
                    "com\\.school\\.reservation\\.global\\.ratelimit\\.InMemoryRateLimitBucketStore"
                }
        ),
        properties = {
            "app.admin.username=admin",
            "app.admin.password=admin1234"
        }
)
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsExactUpPayloadWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"status\":\"UP\"}", true));
    }

    @Test
    void remainsAvailableBeyondTheApiReadRateLimit() throws Exception {
        for (int requestCount = 0; requestCount < 121; requestCount++) {
            mockMvc.perform(get("/health"))
                    .andExpect(status().isOk());
        }
    }
}
