import { Show, SignUpButton } from '@clerk/react'
import LoginInputs from './login-component/login-component'

const LogoutButton = () => {
  return (
      <Show when="signed-out">
        <div className='container grid sm:grid-cols-1 md:grid-cols-2 justify-center items-center mx-auto mt-[5%] p-12 bg-[#FDF3EA] rounded-md '>
          <header className='flex-col items-center flex py-12'>
            <img className='mx-auto' src="src\assets\login-img.png" alt="image-login" width={250} height={250} />
            <h2 className=' text-lg'>We need you to log in to access our feature, please!</h2>
            <SignUpButton mode="modal">
              <button type="button" className="mt-4 rounded bg-black px-4 py-2 text-white">Create account</button>
            </SignUpButton>
          </header>
          <LoginInputs />
        </div>
      </Show>

      
  )
}

export default LogoutButton
