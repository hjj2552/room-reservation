package com.school.reservation.domain.testdata;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.MockMvcCsrfTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.e2e-cleanup.enabled=false"
)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MockMvcCsrfTestConfiguration.class)
class E2eTestDataCleanupDisabledIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void cleanupEndpointIsNotRegisteredWhenDisabled() throws Exception {
        MockHttpSession session = loginAdminSession();

        mockMvc.perform(get("/api/admin/test-data/e2e/preview").session(session))
            .andExpect(status().isNotFound());
    }

    private MockHttpSession loginAdminSession() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "admin1234"
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
    }
}
