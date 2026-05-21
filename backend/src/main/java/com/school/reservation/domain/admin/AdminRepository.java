package com.school.reservation.domain.admin;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminRepository extends JpaRepository<Admin, UUID> {

    Optional<Admin> findByUsernameAndEnabledTrueAndDeletedAtIsNull(String username);
}

