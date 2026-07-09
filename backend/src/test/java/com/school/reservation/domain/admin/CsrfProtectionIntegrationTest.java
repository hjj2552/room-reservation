package com.school.reservation.domain.admin;

import com.school.reservation.support.IntegrationTestSupport;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CsrfProtectionIntegrationTest extends IntegrationTestSupport {

    @Autowired
    WebApplicationContext context;

    @Test
    void csrfEndpointIssuesReadableSpaToken() throws Exception {
        rawMockMvc().perform(get("/api/auth/csrf"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
            .andExpect(jsonPath("$.token").isNotEmpty())
            .andExpect(cookie().exists("XSRF-TOKEN"));
    }

    @Test
    void adminStateChangingRequestRequiresCsrfToken() throws Exception {
        MockHttpSession session = loginAdminSession();

        rawMockMvc().perform(post("/api/admin/rooms")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(roomPayload("CSRF Missing Room")))
            .andExpect(status().isForbidden());

        Cookie csrfCookie = csrfCookie(session);

        rawMockMvc().perform(post("/api/admin/rooms")
                .session(session)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content(roomPayload("CSRF Allowed Room")))
            .andExpect(status().isCreated());
    }

    @Test
    void publicStateChangingRequestRequiresCsrfToken() throws Exception {
        UUID roomId = firstRoomId();

        rawMockMvc().perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "CSRF Public",
                      "applicantEmail": "csrf-public@example.test",
                      "applicantPhone": "010-1000-2000",
                      "purpose": "CSRF missing public reservation",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "csrf-password"
                    }
                    """.formatted(roomId, nextWeekdayAt(13, 0), nextWeekdayAt(14, 0))))
            .andExpect(status().isForbidden());
    }

    private MockMvc rawMockMvc() {
        return MockMvcBuilders.webAppContextSetup(context)
            .apply(springSecurity())
            .build();
    }

    private Cookie csrfCookie(MockHttpSession session) throws Exception {
        MvcResult result = rawMockMvc().perform(get("/api/auth/csrf").session(session))
            .andExpect(status().isOk())
            .andReturn();
        return result.getResponse().getCookie("XSRF-TOKEN");
    }

    private String roomPayload(String name) {
        return """
            {
              "name": "%s",
              "location": "CSRF test building",
              "capacity": 20,
              "description": "CSRF integration test",
              "enabled": true
            }
            """.formatted(name);
    }
}
