import React from "react";
import Alert from "react-bootstrap/Alert";
import Form  from "react-bootstrap/Form";
import Modal  from "react-bootstrap/Modal";
import { AppStateStore } from "../../stores/appstate";

const LoginControl = ({ signInRequired, onSignIn , onRegistration}) => {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pwd, setPwd] = React.useState("");

  const [isRegMode, setIsRegMode] = React.useState(false);
  const [signInFailed, setSignInFailed] = React.useState(false);
  const [registrationFailed, setRegistrationFailed] = React.useState(false);

  const handleSignIn = (event) => {
    event.preventDefault();

    onSignIn({ email: email, password: pwd}).then(
      (loggedIn) => {
        if (!loggedIn) {
          setSignInFailed(true);
        } else {
          setSignInFailed(false);
        }
      }
    );
  };

  const handleRegister = (event) => {
    event?.preventDefault();

    onRegistration({ email: email, password: pwd, name:name}).then(
      (loggedIn) => {
        if (!loggedIn) {
          setRegistrationFailed(true);
        } else {
          setRegistrationFailed(false);
        }
      }
    );
  };

  const handleCancel = () => {
    AppStateStore.update((s) => {
      s.isSignInRequired = false;
    });
  };

  return (
    <Modal show={signInRequired}>
      <Modal.Body>
        <div>
          <p>
            Sign in to your Soundshed.com account to share content with the
            community:

            
            {!isRegMode ? (
              <button className="btn btn-sm btn-secondary ms-2"
                onClick={() => {
                  setIsRegMode(true);
                }}
              >
                New User
              </button>
            ) : (
              <button className="btn btn-sm btn-secondary ms-2"
                onClick={() => {
                  setIsRegMode(false);
                }}
              >
                Existing User
              </button>
            )}
          </p>

          <Form>
            {isRegMode ? (
              <Form.Group controlId="formBasicName">
                <Form.Label>Name (public)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter a name or nickname"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </Form.Group>
            ) : (
              ""
            )}

            <Form.Group controlId="formBasicEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </Form.Group>

            <Form.Group controlId="formBasicPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Password"
                value={pwd}
                onChange={(event) => {
                  setPwd(event.target.value);
                }}
              />
            </Form.Group>

            <div className="mt-2">
              {signInFailed ? (
                <Alert variant="danger">
                  Sign In failed. Check email address and password are correct.
                </Alert>
              ) : (
                ""
              )}

              {registrationFailed ? (
                <Alert variant="danger">
                  Registration failed. Check email address and password are set
                  and you are not using an email that's already registered.
                </Alert>
              ) : (
                ""
              )}

              <button className="btn btn-secondary" type="button" onClick={handleCancel}>
                Cancel
              </button>

              {!isRegMode ? (
                <button
                className="float-end btn btn-primary"
                  type="button"
                  onClick={handleSignIn}
                >
                  Sign In
                </button>
              ) : (
                <button
                  className="btn btn-info float-end"
                  type="button"
                  onClick={handleRegister}
                >
                  New User
                </button>
              )}
            </div>
          </Form>

          <p className="small mt-2">Note: A Soundshed.com account is unrelated to a PG Account and is used to share tones to soundshed.com community.</p>
        </div>
      </Modal.Body>
    </Modal>
  );
};
export default LoginControl;
