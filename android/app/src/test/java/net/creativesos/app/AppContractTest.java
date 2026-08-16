package net.creativesos.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AppContractTest {
    @Test
    public void applicationIdentityIsStable() {
        assertEquals("net.creativesos.app", BuildConfig.APPLICATION_ID);
    }
}
