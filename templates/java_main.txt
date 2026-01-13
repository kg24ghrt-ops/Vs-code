import java.util.Scanner;

/**
 * Remote Runner: Java Starter Template
 * This file will be executed on the GitHub Actions server.
 */
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        System.out.println("--- Java Remote Runner ---");
        System.out.println("System Version: " + System.getProperty("java.version"));
        
        System.out.print("Enter some text to echo: ");
        
        if (sc.hasNextLine()) {
            String inputData = sc.nextLine();
            System.out.println("\nYou entered: " + inputData);
        } else {
            System.out.println("\nNo input received from terminal.");
        }

        System.out.println("--------------------------");
        sc.close();
    }
}