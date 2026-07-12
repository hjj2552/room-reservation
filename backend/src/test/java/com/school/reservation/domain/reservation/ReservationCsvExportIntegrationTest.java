package com.school.reservation.domain.reservation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class ReservationCsvExportIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void reservationsCsvCanBeDownloadedAndFiltered() throws Exception {
        MockHttpSession session = loginAsAdmin();
        createReservation(session, nextWeekdayAt(15, 0), "Csv Target", "target@example.com");
        createReservation(session, nextWeekdayAt(16, 0), "Csv Other", "other@example.com");

        byte[] body = mockMvc.perform(get("/api/admin/exports/reservations.csv")
                .session(session)
                .param("keyword", "Csv Target"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"reservations.csv\""))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();

        String csv = new String(body, StandardCharsets.UTF_8);
        assertThat(body).startsWith(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
        assertThat(csv).startsWith("\uFEFFreservationId,roomName,applicantName,applicantEmail,applicantPhone,purpose,startAt,endAt,status,source,recurrenceId,createdAt");
        assertThat(csv).contains("Csv Target");
        assertThat(csv).doesNotContain("Csv Other");
        assertThat(csv).contains("target@example.com");
        assertThat(csv).contains(",CONFIRMED,ADMIN_MANUAL,");

        String[] lines = csv.replace("\uFEFF", "").split("\n");
        assertThat(lines).hasSize(2);
        String[] columns = lines[1].split(",", -1);
        Pattern kstDateTime = Pattern.compile("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}");
        assertThat(columns[6]).matches(kstDateTime);
        assertThat(columns[7]).matches(kstDateTime);
        assertThat(columns[11].trim()).matches(kstDateTime);
    }

    private void createReservation(MockHttpSession session, OffsetDateTime startAt, String applicantName, String email) throws Exception {
        mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "%s",
                      "applicantEmail": "%s",
                      "applicantPhone": "010-7777-7777",
                      "purpose": "CSV export",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED"
                    }
                    """.formatted(testRoomId(), applicantName, email, startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated());
    }

    private MockHttpSession loginAsAdmin() throws Exception {
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
